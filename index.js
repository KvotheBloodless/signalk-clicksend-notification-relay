const https = require('https');

module.exports = function (app) {
  var unsubscribes = [];
  var plugin = {};
  var last_states = {}
  var config
  var name

  plugin.id = 'signalk-clicksend-notification-relay';
  plugin.name = 'SignalK Clicksend SMS Notification Relay';
  plugin.description = 'Notification to SMS relay for SignalK node server';

  plugin.start = function (options, restartPlugin) {

    config = options;

    name = app.getSelfPath('name');

    var subscribes = [{
      path: `notifications.*`,
      policy: 'instant'
    }];
    if(config.notifications.length != 0)
      subscribes = config.notifications.map(n => {

        const subscribe = {};

        subscribe.path = `notifications.${n.path}`;
        subscribe.policy = 'instant';

        return subscribe;
      });

    let command = {
      context: 'vessels.self',
      subscribe: subscribes
    };

    app.debug('Subscribe command: ' + JSON.stringify(command, null, 2));

    app.subscriptionmanager.subscribe(
      command,
      unsubscribes,
      subscription_error,
      got_delta
    );

    app.debug('Plugin started with config: ' + JSON.stringify(config, null, 2));
  };

  function subscription_error(err) {

    app.error("Subscription error: " + err);
  }

  function got_delta(notification) {

    handle_notification_delta(app,
                            plugin.id,
                            notification,
                            last_states);
  }

  function handle_notification_delta(app, id, notification, last_states) {

    notification.updates.forEach(u => {

      u.values.forEach(v => {

        if (v.value != null && typeof v.value.message != 'undefined' && v.value.message != null) {

            if ((last_states[v.path] == null && v.value.state != 'normal')
                || (last_states[v.path] != null && last_states[v.path] != v.value.state)) {

            last_states[v.path] = v.value.state;

            var watchedLevels = ['normal', 'warn', 'alert', 'alarm', 'emergency'];

            if(config.notifications.length != 0 && config.notifications.filter(n => v.path == `notifications.${n.path}`) != 'undefined' && config.notifications.filter(n => v.path == `notifications.${n.path}`)[0].levels.length != 0)
              watchedLevels = config.notifications.filter(n => v.path == `notifications.${n.path}`)[0].levels;

            if(watchedLevels.includes(v.value.state)) {

              var message = `State of ${v.path} toggled to [${v.value.state}] - ${v.value.message}`;
              var numbers = config.numbers.map(e => e.number).join(',');

              const options = {
                hostname: 'api-mapper.clicksend.com',
                port: 443,
                path: `/http/v2/send.php?method=http&username=${encodeURIComponent(config.api_username)}&key=${encodeURIComponent(config.api_key)}&to=${encodeURIComponent(numbers)}&message=${encodeURIComponent(message)}&senderid=${encodeURIComponent(name)}`,
                method: 'GET',
              };

              const req = https.request(options, res => {

                app.debug(`Status code from ClickSend request: ${res.statusCode}`);

                res.on('data', data => {

                  app.debug(`Response from ClickSend request: ${data}`);
                });
              });

              req.on('error', error => {

                app.error(`Error from ClickSend request: ${error}`);
              });

              req.end();
            }
          }
        }
      });
    });
  }

  plugin.stop = function () {

    unsubscribes.forEach(f => f());
    unsubscribes = [];

    app.debug('Plugin stopped');
  };

  plugin.schema = {
    // The plugin schema
    title: 'Relay Emergency Notifications to SMS',
    description: 'ClickSend Credentials. Go to ClickSend dashboard -> Developers -> API Credentials',
    type: 'object',
    required: ['api_username', 'api_key'],
    properties: {
      api_username: {
        type: 'string',
        title: 'Username',
        description: 'The username from your ClickSend account (normally, your email address)'
      },
      api_key: {
        type: 'string',
        title: 'API Key',
        description: 'The API key from your ClickSend dashboard'
      },
      numbers: {
        type: 'array',
        title: 'Phone Numbers',
        items: {
          type: 'object',
          required: ['number'],
          properties: {
            number: {
              type: 'string',
              title: 'Number',
              description: 'Full mobile number including country code - eg: +61400111222'
            }
          }
        }
      },
      notifications: {
        type: 'array',
        title: 'Notification',
        description: 'Which notifications specifically do you want to be notified for? If none are specified, you will be notified for all state changes of all notification paths.',
        items: {
          type: 'object',
          required: ['path'],
          properties: {
            path: {
              type: 'string',
              title: 'Notification path',
              description: 'The part that comes after \'notification.\' eg: navigation.anchor'
            },
            levels: {
              type: 'array',
              title: 'Notification levels',
              description: 'Which notification levels do you want to be notified for? If none are specified, you will be notified for all level changes.',
              items: {
                type: 'string',
                enum: [
                  'normal',
                  'warn',
                  'alert',
                  'alarm',
                  'emergency'
                ]
              }
            }
          }
        }
      }
    }
  };

  return plugin;
};
