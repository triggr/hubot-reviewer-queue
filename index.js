const path = require('path');

module.exports = (robot) => {
  robot.loadFile(path.resolve(__dirname, 'src'), 'reviewerQueue.js');
};
