/* jshint esversion: 6 */

exports.demoInfo = {
  //rootUrl: "https://us-central1-collabspace-920f6.cloudfunctions.net/",
  rootUrl: "http://localhost:5000/collabspace-920f6/us-central1/",
  numTeachers: 2,
  numStudents: 20,
  isDemo: (domain) => {
    return (domain.indexOf("us-central1") !== -1) || (domain.indexOf("demo") !== -1);
  }
};
