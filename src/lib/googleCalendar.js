const {google} = require('googleapis');

const AUTH_KEY = 'googleAuth';

// Fetch events on the Triggr Travel Calendar that are occuring now.
// Handle errors by logging and returning an empty list.
module.exports = {
  fetchTravelEvents: function(robot) {
    return new Promise((resolve) => {
      getAuth(robot, (err, auth) => {
        if (err) {
          robot.logger.error('Error authenticating with google calendar', err);
          return resolve([]);
        }
        fetchEvents(auth, (err, result) => {
          if (err) {
            robot.logger.error('Error fetching travel calendar events', err);
            return resolve([]);
          }
          resolve(result);
        });
      });
    });
  },
};

// Authenticate with Google OAuth 2.0 so we request events on the Triggr Calendar.
function getAuth(robot, done) {
  // Refresh token is created by generating an authUrl and authorizing
  // as a user under the Triggr organization. If we ever need to regenerate a refresh token,
  // follow steps here: https://developers.google.com/calendar/quickstart/nodejs
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!refreshToken || !clientSecret || !clientId || !redirectUri) {
    done(new Error('Missing Google Environment Var'));
    return;
  }
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oAuth2Client.setCredentials({refresh_token: refreshToken});
  let authParams = robot.brain.get(AUTH_KEY) || {};
  // Refresh token is a permanent credential. Access token is a temporary credential.
  // If we have not recently requested an access token, use the refresh token to request
  // a new access token.
  if (!authParams.expiry_date || authParams.expiry_date < Date.now().getTime()) {
    oAuth2Client.refreshAccessToken((err, data) => {
      if (err) {
        done(err);
      }
      // Cache the access token and expiry date.
      robot.brain.set(AUTH_KEY, {
        access_token: data.access_token,
        expiry_date: data.expiry_date,
      });
      done(null, oAuth2Client);
    });
  } else {
    oAuth2Client.setCredentials({
      access_token: authParams.access_token,
      token_type: 'Bearer',
      refresh_token: refreshToken,
      expiry_date: authParams.expiry_date,
    });
    done(null, oAuth2Client);
  }
}

function fetchEvents(auth, done) {
  let calendar = google.calendar({version: 'v3', auth});
  let now = new Date();
  // There is no supported way to query for events happening "now". Instead,
  // query for events that end after now and ignore the ones that have not started.
  calendar.events.list(
    {
      timeMin: now.toISOString(), // Search for events that end later than now.
      calendarId: process.env.GOOGLE_TRAVEL_CALENDAR_ID,
      // Query for a large number of events to guarantee we don't miss any happening now.
      maxResults: 50,
      // Expand recurring events into individual events so we can use the `orderBy` field.
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'UTC', // Local timezone on deploy machine
    },
    (err, response) => {
      if (err) {
        done(err);
      }
      let events = response.data.items.filter((event) => {
        let startDate = event.start.dateTime || event.start.date;
        return new Date(startDate).getTime() < now.getTime();
      });
      done(null, events);
    }
  );
}
