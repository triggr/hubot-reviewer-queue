# hubot-reviewer-queue
Hubot assigns a reviews in a round robin fashion.

Based on https://github.com/sakatam/hubot-reviewer-lotto.

# preparation

## create a team in your github organization

![image](https://cloud.githubusercontent.com/assets/81522/3102957/76422e2c-e64e-11e3-91ee-7e4075d0f685.png)

members of this organization are candidate reviewers.


## grab a github access token
* open https://github.com/settings/tokens/new
* select scopes: `repo` & `public_repo` & `read:org`

# installation
* install this npm package to your hubot repo
    * `npm i --save hubot-reviewer-queue`
* add `"hubot-reviewer-queue"` to your `external-scripts.json`
* set the following env vars
  <table>
      <tr>
          <th>`HUBOT_GITHUB_TOKEN`</th>
          <td>required. the access token you created above.</td>
      </tr>
      <tr>
          <th>`HUBOT_GITHUB_ORG`</th>
          <td>required. name of your github organization.</td>
      </tr>
      <tr>
          <th>`HUBOT_GITHUB_REVIEWER_TEAM`</th>
          <td>required. the reviewer team id you created above.</td>
      </tr>
      <tr>
          <th>`HUBOT_GITHUB_REVIEWER_MAIL_MAP`</th>
          <td>JSON object with emails as keys and Github usernames as values.</td>
      </tr>
      <tr>
          <th>`HUBOT_GITHUB_WITH_AVATAR`</th>
          <td>optional. assignee's avatar image will be posted if this var is set to "1".</td>
      </tr>
      <tr>
          <th>`HUBOT_REVIEWER_DEBUG`</th>
          <td>optional. turns off live Github API requests.</td>
      </tr>
      <tr>
          <th>`GOOGLE_CLIENT_ID`</th>
          <td>Authentication client id for Google Calendar integration.</td>
      </tr>
      <tr>
          <th>`GOOGLE_CLIENT_SECRET`</th>
          <td>Authentication secret key for Google Calendar integration.</td>
      </tr>
      <tr>
          <th>`GOOGLE_REFRESH_TOKEN`</th>
          <td>Refresh token to retrieve authentication access token for Google Calendar integration.</td>
      </tr>
      <tr>
          <th>`GOOGLE_REDIRECT_URI`</th>
          <td>Redirection location for successful authentication for Google Calendar integration.</td>
      </tr>
</table>

# usage
* `hubot reviewer for <repo> <pull>`
* e.g. `hubot reviewer for repo_name 100`

# get involved

See above link for original repository and author. This project is not actively looking for contributors.
