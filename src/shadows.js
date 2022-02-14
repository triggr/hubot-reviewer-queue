// SHADOWS CONFIG FOR REVIEWER QUEUE
//
// Each member should be a Github login with one or more shadows. They
// correspond to an array of Github logins that represent the team members
// shadowing them.
// Ex.
// 'brian17lai': ['brycefarnsworth', 'hchamorro'],
//
// Shadows will not be included in the reviewer queue. If a selected reviewer
// is assigned to a pull request, their shadows will be assigned as well.
//
// Team members that do not have shadows and are not listed here will still
// be included in the reviewer queue.
//
// Ensure that:
// - All Github logins are exactly correct.
// - No one listed as a shadow is also listed as a top level reviewer.

module.exports = {
    'brian17lai': ['brycefarnsworth'],
    'joshgachnang': ['hchamorro'],
};