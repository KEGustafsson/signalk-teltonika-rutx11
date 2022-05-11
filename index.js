const modbus = require('modbus-stream');

function getData(address, quantity, options) {
  return new Promise((resolve, reject) => {
    modbus.tcp.connect(options.port, options.ip, {
      debug: null,
    }, (err, connection) => {
      if (err) {
        reject(err);
        return;
      }
      connection.once('error', (connErr) => {
        reject(connErr);
      });
      try {
        connection.readHoldingRegisters({
          address,
          quantity,
        }, (readErr, res) => {
          if (readErr) {
            console.log("Addr: ", address);
            console.log("Num: ", quantity);
            return;
          }
          resolve(res.response.data);
        });
      } catch (error) {
        console.error(error)
      }
    });
  });
}

module.exports = function createPlugin(app) {
  const plugin = {};
  plugin.id = 'signalk-teltonika-rutx11';
  plugin.name = 'Teltonika Modem Modbus';
  plugin.description = 'Plugin that retrieves status from a Teltonika RUT modem via Modbus';

  let timeout = null;
  plugin.start = function start(options) {
    app.setPluginStatus('Initializing');
    plugin.setMeta();
    plugin.fetchStatus(options);
  };
  plugin.setMeta = function setMeta() {
    app.handleMessage(plugin.id, {
      context: `vessels.${app.selfId}`,
      updates: [
        {
          meta: [
            { path: 'networking.modem.temperature', value: { units: 'K' } },
          ],
        },
      ],
    });
  };
  plugin.fetchStatus = function fetchStatus(options) {
    const values = [];
    getData(1, 2, options)
      .then((data) => {
        const modemUptime = Buffer.concat(data.slice(0, 2)).readUInt32BE();
        values.push({
          path: 'networking.modem.uptime',
          value: modemUptime,
        });
      })
      .then(() => {
        app.handleMessage(plugin.id, {
          context: `vessels.${app.selfId}`,
          updates: [
            {
              source: {
                label: plugin.id,
              },
              timestamp: (new Date().toISOString()),
              values,
            },
          ],
        });
      })
      .catch((err) => {
        app.setPluginError(err.message);
      });

    timeout = setTimeout(() => {
      plugin.fetchStatus(options);
    }, options.interval * 1000);
  };

  plugin.stop = function stop() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  plugin.schema = {
    type: 'object',
    description: 'For Teltonika RUT240, 360, 950, 955, X9, X11, X14 modems',
    properties: {
      RUT240: {
        type: 'boolean',
        title: 'Select only in case using RUT240 with older firmware than 7.x',
        default: false,
      },
      ip: {
        type: 'string',
        default: '192.168.1.1',
        title: 'Modem IP address',
      },
      port: {
        type: 'integer',
        default: 502,
        title: 'Modem Modbus port (note: Modbus must be enabled on the router)',
      },
      interval: {
        type: 'integer',
        default: 60,
        title: 'How often to fetch the status (in seconds)',
      },
    },
  };
  return plugin;
};
