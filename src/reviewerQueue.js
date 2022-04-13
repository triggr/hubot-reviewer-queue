// Description:
//   assigns reviewers in a round robin fashion for pull requests.
//
// Configuration:
//   HUBOT_GITHUB_TOKEN (required)
//   HUBOT_GITHUB_ORG (required)
//   HUBOT_GITHUB_REVIEWER_TEAM (required)
//     github team id. this script picks the next eligible reviewer off a queue
//   HUBOT_GITHUB_REVIEWER_SHADOWS (optional)
//     map of reviewer github logins to reviewer shadow logins
//     Ex. { 'joshgachnang': ['brycefarnsworth'] }
//
// Commands:
//   hubot reviewer for <repo> <pull> - assigns the next reviewer for pull request
//   hubot reviewer show stats - proves the lotto has no bias
//
// Author:
//   sakatam
//   pcsforeducation

const _ = require('lodash');
const {Octokit} = require('@octokit/rest');

module.exports = function(robot) {
  const ghToken = process.env.HUBOT_GITHUB_TOKEN;
  const ghOrg = process.env.HUBOT_GITHUB_ORG;
  const ghReviewerTeam = process.env.HUBOT_GITHUB_REVIEWER_TEAM;
  const reviewerShadowsMap = process.env.HUBOT_GITHUB_REVIEWER_SHADOWS ? process.env.HUBOT_GITHUB_REVIEWER_SHADOWS : '{}';
  const ghWithAvatar = ['1', 'true'].includes(process.env.HUBOT_GITHUB_WITH_AVATAR);
  const debug = ['1', 'true'].includes(process.env.HUBOT_REVIEWER_QUEUE_DEBUG);

  const STATS_KEY = 'reviewer-round-robin';

  if (ghToken === null || ghOrg === null || ghReviewerTeam === null) {
    return robot.logger.error(`\
reviewer-queue is not loaded due to missing configuration!
${__filename}
HUBOT_GITHUB_TOKEN: ${ghToken}
HUBOT_GITHUB_ORG: ${ghOrg}
HUBOT_GITHUB_REVIEWER_TEAM: ${ghReviewerTeam}\
`);
  }

  robot.respond(/reviewer reset stats/i, function(msg) {
    robot.brain.set(STATS_KEY, {});
    return msg.reply('Reset reviewer stats!');
  });

  robot.respond(/reviewer show stats$/i, function(msg) {
    let count;
    const stats = robot.brain.get(STATS_KEY);
    const msgs = ['login, percentage, num assigned'];
    let total = 0;
    for (let login in stats) {
      if (login === 'reviewers') { continue; }
      count = stats[login];
      total += count;
    }
    for (let login in stats) {
      if (login === 'reviewers') { continue; }
      count = stats[login];
      const percentage = Math.floor(count * 100.0 / total);
      msgs.push(`${login}, ${percentage}%, ${count}`);
    }
    return msg.reply(msgs.join('\n'));
  });

  let assignReviewer = async function(msg) {
    const repo = msg.match[1];
    const pr = msg.match[2];
    const prParams = {
      owner: ghOrg,
      repo,
      issue_number: pr,
      pull_number: pr,
    };

    const octokit = new Octokit({auth: ghToken});

    // mock api if debug mode
    if (debug) {
      octokit.rest.issues.createComment = function(params, cb) {
        robot.logger.info('GitHubApi - createComment is called', params);
        return cb(null);
      };
      octokit.rest.issues.update = function(params, cb) {
        robot.logger.info('GitHubApi - edit is called', params);
        return cb(null);
      };
    }

    let [{data: reviewers}, {data: issue}] = await Promise.all([
      octokit.rest.teams.listMembersInOrg({
        org: ghOrg,
        team_slug: ghReviewerTeam,
        per_page: 100,
      }),
      octokit.rest.issues.get(prParams),
    ]);
    let creator = issue.user;
    let assignee = issue.assignee;

    const stats = robot.brain.get(STATS_KEY) || {};

    // (re)initialize stats if reviewers is empty or the members have changed.
    if (
      !stats.reviewers ||
      !_.isEqual(_.map(stats.reviewers, 'login').sort(), _.map(reviewers, 'login').sort())
    ) {
      robot.logger.debug('(re)initializing stats');
      stats.reviewers = reviewers;
    }

    // pick reviewer
    reviewers = stats.reviewers;
    reviewers = reviewers.filter((r) => r.login !== creator.login);

    // exclude current assignee from reviewer candidates
    if (assignee !== null) {
      reviewers = reviewers.filter((r) => r.login !== assignee.login);
    }

    if (reviewers.length === 0) {
      msg.reply('No available reviewers, sorry!');
      return;
    }

    robot.logger.debug(`Eligible reviewer queue: ${reviewers.map((r) => r.login)}`);
    // pick first reviewer from the queue
    const newReviewer = reviewers[0];
    robot.logger.info(`Choose from queue: ${newReviewer.login}`);
    let originalIndex = -1;
    for (let i = 0; i < stats['reviewers'].length; i++) {
      const r = stats['reviewers'][i];
      if (r.login === newReviewer.login) {
        originalIndex = i;
      }
    }

    // move reviewer to the end
    stats['reviewers'].splice(originalIndex, 1);
    stats['reviewers'].push(newReviewer);

    // save reviewer queue back to robot brain
    robot.brain.set(STATS_KEY, stats);

    let reviewer = newReviewer;

    // change assignee
    await octokit.rest.issues.update(_.extend({assignee: reviewer.login}, prParams));
    robot.logger.info(`Would have assigned ${reviewer.login}`);

    // get reviewer shadows
    let reqReviewers = [reviewer.login];
    const shadows = JSON.parse(reviewerShadowsMap);
    if (shadows[reviewer.login]) {
      for (let shadow of shadows[reviewer.login]) {
        if (shadow === creator.login) { continue; }
        reqReviewers.push(shadow);
        robot.logger.info(`Adding ${shadow} as shadow.`);
      }
    }

    // request a review
    await octokit.rest.pulls.requestReviewers(_.extend({reviewers: reqReviewers}, prParams));
    robot.logger.debug(`Would have requested a review from ${reviewer.login}`);

    msg.reply(`${reviewer.login} has been assigned for ${issue.html_url} as a reviewer`);
    if (ghWithAvatar) {
      let url = reviewer.avatar_url;
      url = `${url}t=${Date.now()}`; // cache buster
      url = url.replace(/(#.*|$)/, '#.png'); // hipchat needs image-ish url to display inline image
      msg.send(url);
    }

    // update stats
    if (!stats[reviewer.login]) {
      stats[reviewer.login] = 0;
    }
    stats[reviewer.login]++;
    robot.brain.set(STATS_KEY, stats);
  };

  return robot.respond(/reviewer for ([\w-\.]+) (\d+)?$/i, async (msg) => {
    try {
      await assignReviewer(msg);
    } catch (e) {
      robot.logger.error(e);
      msg.reply(`an error occured.\n${e}`);
    }
  });
};
