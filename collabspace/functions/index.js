/* jshint esversion: 6 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const config = functions.config();
const querystring = require("querystring");
const cors = require("cors")({
  origin: true,
  credentials: true
});
const jwt = require("jsonwebtoken");
const demoInfo = require("./demo-info").demoInfo;

admin.initializeApp(config.firebase);

// NOTE: this private key below is just a random key - it is not used anywhere for real other than this demo
const fakePrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIICXAIBAAKBgQCKyCQM42VXcOr5zKNWOlgz/GoRtLUR+r5WWTObk140u+6XFkT0
0in4zZqp01Pe2LMTCvDm1OsXg41Ih6qPs+5i+elMyAEf/ljJXS2eGEBJKr/JXkqQ
Qcs4oiVgiRavtoDiny7Xw81A8bPWkMS10cRruPdhnX7TyKDAe/w5dpJPqwIDAQAB
AoGAdDZaMcytTQaKTXl2ATvEJmwk6gS3Z4HfpvD1TT6fMWt5xFzqi1P9v5F0BOeo
oMA3XCfaSIFdB4iqY2Tvh3w1jr8b+tZ4oUn8/GgLg5XlJj7K525FMs0cBb7zVBke
eNq1jr050jOHcrE07KcBT0Xlk82YQmFwivRDd5pGbvoRoMECQQDZxEMgO/rC4JfJ
U4gXCD+vFXIUCxhuQ6K0X9WSw2BBOWMtouiMJpkOxaFp/QKx2CpLUVwFD84A/kRH
J7VM82shAkEAoyXTiWxgEQ956PA44bIDBJYNfL8G480iSwG/IZ8b5avXJcmbGscI
gDrH9nBYX+Mt5Cvy2CVfbKG077Fe0+lNSwJAfmtfhLENTGDR/UCO+sABKIVMqrIe
RrThGdGgzQi7MmI8X1v5oJMvu9GjeUI2dERHmV3sC8w3DYCO5rf4mmmdwQJAPHj0
4+dL5Ib8BR+lteKpw7Vq4mZcQ2vx3iOTmP7E9GixoswLte04dW9UV0BlQYWPqRex
N/UCXd3Cl2YDZEEB6QJBANZ7NQfgS8ItzvmGCzw0BRQrgRD75/NCVoGdmNibo43h
SmFf2TwG0nKYks4G/6F64BxWbUzigeoEPsEnWrZrHG4=
-----END RSA PRIVATE KEY-----`;

const fakePublicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCKyCQM42VXcOr5zKNWOlgz/GoR
tLUR+r5WWTObk140u+6XFkT00in4zZqp01Pe2LMTCvDm1OsXg41Ih6qPs+5i+elM
yAEf/ljJXS2eGEBJKr/JXkqQQcs4oiVgiRavtoDiny7Xw81A8bPWkMS10cRruPdh
nX7TyKDAe/w5dpJPqwIDAQAB
-----END PUBLIC KEY-----`;

const getAuthorizationToken = (request, tokenType, callback) => {
  if (request.headers && request.headers.authorization) {
    const headerParts = request.headers.authorization.split(" ");
    if ((headerParts.length === 2) && (headerParts[0] === tokenType)) {
      callback(null, headerParts[1]);
    }
    else {
      callback(`Invalid authorization header: ${request.headers.authorization} (expected ${tokenType})`);
    }
  }
  else {
    callback("Missing authorization header");
  }
};

const getDemoUserFromAuthToken = (request, response, callback) => {
  getAuthorizationToken(request, "Bearer", (err, token) => {
    if (err) {
      callback(err);
    }
    else {
      const userId = parseInt(token);
      if (!isNaN(userId)) {
        callback(null, createDemoUser(userId));
      }
      else {
        callback(`Invalid bearer token: ${token} (must be simple integer for demo)`);
      }
    }
  });
};

const getDemoUserFromJWTToken = (request, response, callback) => {
  getAuthorizationToken(request, "Bearer/JWT", (err, token) => {
    if (err) {
      callback(err);
    }
    else {
      jwt.verify(token, fakePublicKey, function(err, decoded) {
        if (err) {
          callback(err);
        }
        else if (!decoded.uid) {
          callback("Missing uid in JWT bearer token!");
        }
        else {
          callback(null, createDemoUser(decoded.uid));
        }
      });
    }
  });
};

const createDemoUser = (userId) => {
  if (userId < 1000) {
    return {
      id: userId,
      email: `no-email-${userId}@concord.org`,
      first_name: "Student",
      last_name: `${userId}`
    };
  }
  return {
    id: userId,
    first_name: "Teacher",
    last_name: `${userId - 999}`
  };
};

const sendError = (response, message, code) => {
  response.status(code || 500);
  response.json({response_type:"ERROR", message: message});
};

exports.demoGetFakeFirebaseJWT = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    getDemoUserFromAuthToken(request, response, (err, user) => {
      if (err) {
        sendError(response, err, 403);
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const oneHourFromNow = now + (60 * 60);
      const claims = {
        "alg": "RS256",
        "iss": "firebase-adminsdk-gy3ts@collabspace-920f6.iam.gserviceaccount.com",
        "sub": "firebase-adminsdk-gy3ts@collabspace-920f6.iam.gserviceaccount.com",
        "aud": "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
        "iat": now,
        "exp": oneHourFromNow,
        "uid": user.id,
        "domain": demoInfo.rootUrl,
        "externalId": 1,
        "returnUrl": `${demoInfo.rootUrl}dataservice/external_activity_data/debc99c7-daa2-4758-86f7-2ca4f3726c66`,
        "logging": false,
        "domain_uid": user.id,
        "class_info_url": `${demoInfo.rootUrl}demoGetFakeClassInfo`
      };

      jwt.sign(claims, fakePrivateKey, {algorithm: "RS256"}, function(err, token) {
        if (err) {
          sendError(response, err, 403);
        }
        else {
          response.json({token: token});
        }
      });
    });
  });
});

exports.demoGetFakeClassInfo = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    getDemoUserFromJWTToken(request, response, (err, user) => {
      if (err) {
        sendError(response, err, 403);
        return;
      }

      const classInfo = {
        uri: `${demoInfo.rootUrl}portal/classes/1`,
        name: "Demo Class",
        state: "MA",
        class_hash: request.query.demo || "demo",
        teachers: [],
        students: []
      };

      for (let i = 0; i < demoInfo.numTeachers; i++) {
        classInfo.teachers.push(createDemoUser(1000 + i));
      }
      for (let i = 0; i < demoInfo.numStudents; i++) {
        classInfo.students.push(createDemoUser(1 + i));
      }

      response.json(classInfo);
    });
  });
});
