"use strict";

const sinon = require("sinon");
const stream = require("stream");
const EventEmitter = require("events");

describe("Connection", function() {
  let fakes, Connection;

  beforeEach(function () {
    fakes = {
      config: sinon.stub(),
      EndpointManager: sinon.stub(),
      endpointManager: new EventEmitter(),
    };

    fakes.EndpointManager.returns(fakes.endpointManager);

    Connection = require("../lib/connection")(fakes);
  });

  describe("constructor", function () {

    context("called without `new`", function () {
      it("returns a new instance", function () {
        expect(Connection()).to.be.an.instanceof(Connection);
      });
    });

    it("prepares the configuration with passed options", function () {
      let options = { production: true };
      Connection(options);

      expect(fakes.config).to.be.calledWith(options);
    });

    describe("EndpointManager instance", function() {
      it("is created", function () {
        Connection();

        expect(fakes.EndpointManager).to.be.calledOnce;
        expect(fakes.EndpointManager).to.be.calledWithNew;
      });

      it("is passed the prepared configuration", function () {
        const returnSentinel = { "configKey": "configValue"};
        fakes.config.returns(returnSentinel);

        Connection({});
        expect(fakes.EndpointManager).to.be.calledWith(returnSentinel);
      });
    });
  });

  describe("pushNotification", function () {

    beforeEach(function () {
      fakes.config.returnsArg(0);
      fakes.endpointManager.getStream = sinon.stub();

      fakes.EndpointManager.returns(fakes.endpointManager);
    });

    describe("single notification behaviour", function () {

      context("a single stream is available", function () {
        let connection;

        context("transmission succeeds", function () {
          beforeEach( function () {
            connection = new Connection( { address: "testapi" } );

            fakes.stream = new FakeStream("abcd1234", "200");
            fakes.endpointManager.getStream.onCall(0).returns(fakes.stream);
          });

          it("attempts to acquire one stream", function () {
            return connection.pushNotification(notificationDouble(), "abcd1234")
              .then(function () {
                expect(fakes.endpointManager.getStream).to.be.calledOnce;
              });
          });

          describe("headers", function () {

            it("sends the required HTTP/2 headers", function () {
              return connection.pushNotification(notificationDouble(), "abcd1234")
                .then(function () {
                  expect(fakes.stream.headers).to.be.calledWithMatch( {
                    ":scheme": "https",
                    ":method": "POST",
                    ":authority": "testapi",
                    ":path": "/3/device/abcd1234",
                  });
                });
            });

            it("does not include apns headers when not required", function () {
              return connection.pushNotification(notificationDouble(), "abcd1234")
                .then(function () {
                  ["apns-id", "apns-priority", "apns-expiration", "apns-topic"].forEach( header => {
                    expect(fakes.stream.headers).to.not.be.calledWithMatch(sinon.match.has(header));
                  });
                });
            });

            it("sends the notification-specific apns headers when specified", function () {
              let notification = notificationDouble();

              notification.headers.returns({
                "apns-id": "123e4567-e89b-12d3-a456-42665544000",
                "apns-priority": 5,
                "apns-expiration": 123,
                "apns-topic": "io.apn.node",
              });

              return connection.pushNotification(notification, "abcd1234")
                .then(function () {
                  expect(fakes.stream.headers).to.be.calledWithMatch( {
                    "apns-id": "123e4567-e89b-12d3-a456-42665544000",
                    "apns-priority": 5,
                    "apns-expiration": 123,
                    "apns-topic": "io.apn.node",
                  });
                });
            });
          });

          it("writes the notification data to the pipe", function () {
            return connection.pushNotification(notificationDouble(), "abcd1234")
              .then(function () {
                expect(fakes.stream._transform).to.be.calledWithMatch(actual => actual.equals(Buffer(notificationDouble().compile())));
              });
          });

          it("ends the stream", function () {
            return connection.pushNotification(notificationDouble(), "abcd1234")
              .then(function () {
                expect(() => fakes.stream.write("ended?")).to.throw("write after end");
              });
          });

          it("resolves with the device token in the sent array", function () {
            return expect(connection.pushNotification(notificationDouble(), "abcd1234"))
              .to.become({ sent: [{"device": "abcd1234"}], failed: []});
          });
        });

        context("error occurs", function () {
          let promise;

          beforeEach(function () {
            const connection = new Connection( { address: "testapi" } );

            fakes.stream = new FakeStream("abcd1234", "400", { "reason" : "BadDeviceToken" });
            fakes.endpointManager.getStream.onCall(0).returns(fakes.stream);

            promise = connection.pushNotification(notificationDouble(), "abcd1234");
          });

          it("resolves with the device token, status code and response in the failed array", function () {
            return expect(promise).to.eventually.deep.equal({ sent: [], failed: [{"device": "abcd1234", "status": "400", "response": { "reason" : "BadDeviceToken" }}]});
          });
        });
      });

      context("no new stream is returned but the endpoint later wakes up", function () {
        let notification, promise;

        beforeEach( function () {
          const connection = new Connection( { address: "testapi" } );

          fakes.stream = new FakeStream("abcd1234", "200");
          fakes.endpointManager.getStream.onCall(0).returns(null);
          fakes.endpointManager.getStream.onCall(1).returns(fakes.stream);

          notification = notificationDouble();
          promise = connection.pushNotification(notification, "abcd1234");

          expect(fakes.stream.headers).to.not.be.called;

          fakes.endpointManager.emit("wakeup");

          return promise;
        });

        it("sends the required headers to the newly available stream", function () {
          expect(fakes.stream.headers).to.be.calledWithMatch( {
            ":scheme": "https",
            ":method": "POST",
            ":authority": "testapi",
            ":path": "/3/device/abcd1234",
          });
        });

        it("writes the notification data to the pipe", function () {
          expect(fakes.stream._transform).to.be.calledWithMatch(actual => actual.equals(Buffer(notification.compile())));
        });
      });
    });

    context("when 5 tokens are passed", function () {

      beforeEach(function () {
          fakes.streams = [
            new FakeStream("abcd1234", "200"),
            new FakeStream("adfe5969", "400", { reason: "MissingTopic" }),
            new FakeStream("abcd1335", "410", { reason: "BadDeviceToken", timestamp: 123456789 }),
            new FakeStream("bcfe4433", "200"),
            new FakeStream("aabbc788", "413", { reason: "PayloadTooLarge" }),
          ];
      });

      context("streams are always returned", function () {
        let promise;

        beforeEach( function () {
          const connection = new Connection( { address: "testapi" } );

          fakes.endpointManager.getStream.onCall(0).returns(fakes.streams[0]);
          fakes.endpointManager.getStream.onCall(1).returns(fakes.streams[1]);
          fakes.endpointManager.getStream.onCall(2).returns(fakes.streams[2]);
          fakes.endpointManager.getStream.onCall(3).returns(fakes.streams[3]);
          fakes.endpointManager.getStream.onCall(4).returns(fakes.streams[4]);

          promise = connection.pushNotification(notificationDouble(), ["abcd1234", "adfe5969", "abcd1335", "bcfe4433", "aabbc788"]);

          return promise;
        });

        it("sends the required headers for each stream", function () {
          expect(fakes.streams[0].headers).to.be.calledWithMatch( { ":path": "/3/device/abcd1234" } );
          expect(fakes.streams[1].headers).to.be.calledWithMatch( { ":path": "/3/device/adfe5969" } );
          expect(fakes.streams[2].headers).to.be.calledWithMatch( { ":path": "/3/device/abcd1335" } );
          expect(fakes.streams[3].headers).to.be.calledWithMatch( { ":path": "/3/device/bcfe4433" } );
          expect(fakes.streams[4].headers).to.be.calledWithMatch( { ":path": "/3/device/aabbc788" } );
        });

        it("writes the notification data for each stream", function () {
          fakes.streams.forEach( stream => {
            expect(stream._transform).to.be.calledWithMatch(actual => actual.equals(Buffer(notificationDouble().compile())));
          });
        });

        it("resolves with the sent notifications", function () {
          return expect(promise.get("sent")).to.eventually.deep.equal([{device: "abcd1234"}, {device: "bcfe4433"}]);
        });

        it("resolves with the device token, status code and response of the unsent notifications", function () {
          return expect(promise.get("failed")).to.eventually.deep.equal([
            { device: "adfe5969", status: "400", response: { reason: "MissingTopic" }},
            { device: "abcd1335", status: "410", response: { reason: "BadDeviceToken", timestamp: 123456789 }},
            { device: "aabbc788", status: "413", response: { reason: "PayloadTooLarge" }},
          ]);
        });
      });

      context("some streams return, others wake up later", function () {
        let promise;

        beforeEach( function() {
          const connection = new Connection( { address: "testapi" } );

          fakes.endpointManager.getStream.onCall(0).returns(fakes.streams[0]);
          fakes.endpointManager.getStream.onCall(1).returns(fakes.streams[1]);

          promise = connection.pushNotification(notificationDouble(), ["abcd1234", "adfe5969", "abcd1335", "bcfe4433", "aabbc788"]);

          setTimeout(function () {
            fakes.endpointManager.getStream.reset();
            fakes.endpointManager.getStream.onCall(0).returns(fakes.streams[2]);
            fakes.endpointManager.getStream.onCall(1).returns(null);
            fakes.endpointManager.emit("wakeup");
          }, 1);

          setTimeout(function () {
            fakes.endpointManager.getStream.reset();
            fakes.endpointManager.getStream.onCall(0).returns(fakes.streams[3]);
            fakes.endpointManager.getStream.onCall(1).returns(fakes.streams[4]);
            fakes.endpointManager.emit("wakeup");
          }, 2);

          return promise;
        });

        it("sends the correct device ID for each stream", function () {
          expect(fakes.streams[0].headers).to.be.calledWithMatch({":path": "/3/device/abcd1234"});
          expect(fakes.streams[1].headers).to.be.calledWithMatch({":path": "/3/device/adfe5969"});
          expect(fakes.streams[2].headers).to.be.calledWithMatch({":path": "/3/device/abcd1335"});
          expect(fakes.streams[3].headers).to.be.calledWithMatch({":path": "/3/device/bcfe4433"});
          expect(fakes.streams[4].headers).to.be.calledWithMatch({":path": "/3/device/aabbc788"});
        });

        it("writes the notification data for each stream", function () {
          fakes.streams.forEach( stream => {
            expect(stream._transform).to.be.calledWithMatch(actual => actual.equals(Buffer(notificationDouble().compile())));
          });
        });

        it("resolves with the sent notifications", function () {
          return expect(promise.get("sent")).to.eventually.deep.equal([{device: "abcd1234"}, {device: "bcfe4433"}]);
        });

        it("resolves with the device token, status code and response of the unsent notifications", function () {
          return expect(promise.get("failed")).to.eventually.deep.equal([
            { device: "adfe5969", status: "400", response: { reason: "MissingTopic" }},
            { device: "abcd1335", status: "410", response: { reason: "BadDeviceToken", timestamp: 123456789 }},
            { device: "aabbc788", status: "413", response: { reason: "PayloadTooLarge" }},
          ]);
        });
      });
    });
  });
});

function notificationDouble() {
  return {
    headers: sinon.stub().returns({}),
    payload: { aps: { badge: 1 } },
    compile: function() { return JSON.stringify(this.payload); }
  };
}

function FakeStream(deviceId, statusCode, response) {
  const fakeStream = new stream.Transform({
    transform: sinon.spy(function(chunk, encoding, callback) {
      expect(this.headers).to.be.calledOnce;

      const headers = this.headers.firstCall.args[0];
      expect(headers[":path"].substring(10)).to.equal(deviceId);

      this.emit("headers", {
        ":status": statusCode
      });
      callback(null, new Buffer(JSON.stringify(response) || ""));
    })
  });
  fakeStream.headers = sinon.stub();

  return fakeStream;
}
