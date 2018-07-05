// Description:
//   assigns reviewers in a round robin fashion for pull requests.
//
// Configuration:
//   HUBOT_GITHUB_TOKEN (required)
//   HUBOT_GITHUB_ORG (required)
//   HUBOT_GITHUB_REVIEWER_TEAM (required)
//     github team id. this script picks the next eligible reviewer off a queue
//
// Commands:
//   hubot reviewer for <repo> <pull> - assigns the next reviewer for pull request
//   hubot reviewer show stats - proves the lotto has no bias
//
// Author:
//   sakatam
//   pcsforeducation

const _ = require('lodash');
const GitHubApi = require('github');
const {fetchTravelEvents} = require('./lib/googleCalendar');

module.exports = function(robot) {
  const ghToken = process.env.HUBOT_GITHUB_TOKEN;
  const ghOrg = process.env.HUBOT_GITHUB_ORG;
  const ghReviwerTeam = process.env.HUBOT_GITHUB_REVIEWER_TEAM;
  const ghReviewerEmailMap = process.env.HUBOT_GITHUB_REVIEWER_EMAIL_MAP;
  const ghWithAvatar = ['1', 'true'].includes(process.env.HUBOT_GITHUB_WITH_AVATAR);
  const debug = ['1', 'true'].includes(process.env.HUBOT_REVIEWER_LOTTO_DEBUG);

  const STATS_KEY = 'reviewer-round-robin';

  if (ghToken === null || ghOrg === null || ghReviwerTeam === null || ghReviewerEmailMap === null) {
    return robot.logger.error(`\
reviewer-lottery is not loaded due to missing configuration!
${__filename}
HUBOT_GITHUB_TOKEN: ${ghToken}
HUBOT_GITHUB_ORG: ${ghOrg}
HUBOT_GITHUB_REVIEWER_TEAM: ${ghReviwerTeam}
HUBOT_GITHUB_REVIEWER_MAIL_MAP: ${ghReviewerEmailMap}\
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
      count = stats[login];
      total += count;
    }
    for (let login in stats) {
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
      number: pr,
    };

    const gh = new GitHubApi({version: '3.0.0'});
    gh.authenticate({type: 'oauth', token: ghToken});

    // mock api if debug mode
    if (debug) {
      gh.issues.createComment = function(params, cb) {
        robot.logger.info('GitHubApi - createComment is called', params);
        return cb(null);
      };
      gh.issues.edit = function(params, cb) {
        robot.logger.info('GitHubApi - edit is called', params);
        return cb(null);
      };
    }

    let [reviewers, issue, travelEvents] = await Promise.all([
      gh.orgs.getTeamMembers({
        id: ghReviwerTeam,
        per_page: 100,
      }),
      gh.pullRequests.get(prParams),
      fetchTravelEvents(robot),
    ]);
    robot.logger.info(`Fetched ${travelEvents.length} travel events`);
    let creator = issue.user;
    let assignee = issue.assignee;

    const stats = robot.brain.get(STATS_KEY) || {};

    // (re)initialize stats if reviewers is empty or the members have changed.
    if (
      !stats['reviewers'] ||
      !_.isEqual(_.sortBy(stats['reviewers'], 'login'), _.sortBy(reviewers, 'login'))
    ) {
      robot.logger.debug('(re)initializing stats');
      stats['reviewers'] = reviewers;
    }

    let reviewersOnVacation = {};
    let reviewerEmailMap = JSON.parse(ghReviewerEmailMap);
    for (let event of travelEvents) {
      let reviewerLogin = reviewerEmailMap[event.creator.email];
      reviewersOnVacation[reviewerLogin] = true;
    }

    // pick reviewer
    reviewers = stats['reviewers'];
    reviewers = reviewers.filter((r) => r.login !== creator.login && !reviewersOnVacation[r.login]);

    // exclude current assignee from reviewer candidates
    if (assignee !== null) {
      reviewers = reviewers.filter((r) => r.login !== assignee.login);
    }

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
    await gh.issues.edit(_.extend({assignee: reviewer.login}, prParams));
    robot.logger.info(`Would have assigned ${reviewer.login}`);

    // request a review
    await gh.pullRequests.createReviewRequest(_.extend({reviewers: [reviewer.login]}, prParams));
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
