# Description:
#   assigns reviewers in a round robin fashion for pull requests.
#
# Configuration:
#   HUBOT_GITHUB_TOKEN (required)
#   HUBOT_GITHUB_ORG (required)
#   HUBOT_GITHUB_REVIEWER_TEAM (required)
#     github team id. this script picks the next eligible reviewer off a queue
#
# Commands:
#   hubot reviewer for <repo> <pull> - assigns the next reviewer for pull request
#   hubot reviewer show stats - proves the lotto has no bias
#
# Author:
#   sakatam
#   pcsforeducation

_         = require "underscore"
async     = require "async"
GitHubApi = require "github"
weighted  = require "weighted"

module.exports = (robot) ->
  ghToken       = process.env.HUBOT_GITHUB_TOKEN
  ghOrg         = process.env.HUBOT_GITHUB_ORG
  ghReviwerTeam = process.env.HUBOT_GITHUB_REVIEWER_TEAM
  ghWithAvatar  = process.env.HUBOT_GITHUB_WITH_AVATAR in ["1", "true"]
  debug         = process.env.HUBOT_REVIEWER_LOTTO_DEBUG in ["1", "true"]

  STATS_KEY     = 'reviewer-round-robin'

  if !ghToken? or !ghOrg? or !ghReviwerTeam?
    return robot.logger.error """
      reviewer-lottery is not loaded due to missing configuration!
      #{__filename}
      HUBOT_GITHUB_TOKEN: #{ghToken}
      HUBOT_GITHUB_ORG: #{ghOrg}
      HUBOT_GITHUB_REVIEWER_TEAM: #{ghReviwerTeam}
    """

  robot.respond /reviewer reset stats/i, (msg) ->
    robot.brain.set STATS_KEY, {}
    msg.reply "Reset reviewer stats!"

  robot.respond /reviewer show stats$/i, (msg) ->
    stats = robot.brain.get STATS_KEY
    msgs = ["login, percentage, num assigned"]
    total = 0
    for login, count of stats
      total += count
    for login, count of stats
      percentage = Math.floor(count * 100.0 / total)
      msgs.push "#{login}, #{percentage}%, #{count}"
    msg.reply msgs.join "\n"

  robot.respond /reviewer for ([\w-\.]+) (\d+)( polite)?$/i, (msg) ->
    repo = msg.match[1]
    pr   = msg.match[2]
    polite = msg.match[3]?
    prParams =
      owner: ghOrg
      repo: repo
      number: pr

    gh = new GitHubApi version: "3.0.0"
    gh.authenticate {type: "oauth", token: ghToken}

    # mock api if debug mode
    if debug
      gh.issues.createComment = (params, cb) ->
        robot.logger.info "GitHubApi - createComment is called", params
        cb null
      gh.issues.edit = (params, cb) ->
        robot.logger.info "GitHubApi - edit is called", params
        cb null

    async.waterfall [
      (cb) ->
        # get team members
        params =
          id: ghReviwerTeam
          per_page: 100
        gh.orgs.getTeamMembers params, (err, res) ->
          return cb "error on getting team members: #{err.toString()}" if err?
          cb null, {reviewers: res}

      (ctx, cb) ->
        # check if pull req exists
        gh.pullRequests.get prParams, (err, res) ->
          return cb "error on getting pull request: #{err.toString()}" if err?
          ctx['issue'] = res
          ctx['creator'] = res.user
          ctx['assignee'] = res.assignee
          cb null, ctx

      (ctx, cb) ->
        {reviewers, creator, assignee} = ctx
        stats = robot.brain.get STATS_KEY

        # (re)initialize stats if necessary
        if not stats['reviewers'] || stats['reviewers'].length != reviewers.length
          robot.logger.debug '(re)initializing stats'
          stats['reviewers'] = reviewers

        # pick reviewer
        reviewers = stats['reviewers']
        reviewers = reviewers.filter (r) -> r.login != creator.login

        # exclude current assignee from reviewer candidates
        if assignee?
          reviewers = reviewers.filter (r) -> r.login != assignee.login

        # pick first reviewer from the queue
        newReviewer = reviewers[0]
        robot.logger.info 'Choose from queue: ' + newReviewer.login
        originalIndex = -1
        originalIndex = i for r, i in stats['reviewers'] when r.login == newReviewer.login

        # move reviewer to the end
        stats['reviewers'].splice(originalIndex, 1)
        stats['reviewers'].push newReviewer

        # save reviewer queue back to robot brain
        robot.brain.set STATS_KEY, stats

        ctx['reviewer'] = newReviewer
        cb null, ctx

      (ctx, cb) ->
        # change assignee
        {reviewer} = ctx
        params = _.extend { assignee: reviewer.login }, prParams
        gh.issues.edit params, (err, res) -> cb err, ctx
        robot.logger.debug 'Would have assigned ' + reviewer.login

      (ctx, cb) ->
        # request a review
        {reviewer} = ctx
        params = _.extend { reviewers: [reviewer.login] }, prParams
        gh.pullRequests.createReviewRequest params, (err, res) -> cb err, ctx
        robot.logger.debug 'Would have requested a review from ' + reviewer.login

      (ctx, cb) ->
        {reviewer, issue} = ctx
        msg.reply "#{reviewer.login} has been assigned for #{issue.html_url} as a reviewer"
        if ghWithAvatar
          url = reviewer.avatar_url
          url = "#{url}t=#{Date.now()}" # cache buster
          url = url.replace(/(#.*|$)/, '#.png') # hipchat needs image-ish url to display inline image
          msg.send url

        # update stats
        stats = (robot.brain.get STATS_KEY) or {}
        stats[reviewer.login] or= 0
        stats[reviewer.login]++
        robot.brain.set STATS_KEY, stats

        cb null, ctx

    ], (err, res) ->
      if err?
        msg.reply "an error occured.\n#{err}"
