const proxyquire = require('proxyquire').noCallThru();

describe('route rendering/user lookup timing', function() {
  it('renders the profile page after the current user lookup resolves', async function() {
    const renderCalls = [];
    const req = {
      user: {
        local: { email: 'alice@example.com' }
      },
      isAuthenticated: () => true,
      flash: () => []
    };
    const res = {
      render: function(view, model) {
        renderCalls.push({ view, model });
      },
      redirect: function(url) {
        throw new Error('redirect called unexpectedly: ' + url);
      },
      status: function() { return this; },
      send: function() {}
    };

    const userModel = {
      findOne: function(query, cb) {
        process.nextTick(function() {
          cb(null, { local: { email: 'alice@example.com', name: 'Alice' } });
        });
        return { lean: function() { return this; } };
      }
    };

    const settingsModel = {
      findOne: function(query, cb) {
        process.nextTick(function() {
          cb(null, { header: 'Site', twitter: '@site', facebook: 'fb', theme: 'readable', newUsers: true });
        });
        return { lean: function() { return this; } };
      }
    };

    const tools = {
      loadCurrentUser: function(request, callback) {
        userModel.findOne({}, callback);
      },
      getSettings: function(viewModel, response, page) {
        expect(viewModel.user).to.deep.equal({ local: { email: 'alice@example.com', name: 'Alice' } });
        response.render(page, viewModel);
      }
    };

    const routeModule = proxyquire('../server/routes', {
      '../models/user': userModel,
      '../models/settings': settingsModel,
      '../server/tools.js': tools,
      'connect-flash': function() { return function() {}; },
      'node-persist': {
        init: async function() {},
        getItem: async function() { return null; },
        setItem: async function() { return null; }
      },
      'properties-reader': function() {
        return {
          get: function(key) {
            return {
              'admin.settingsID': 'settings-1',
              'main.lamaTitle': 'Lama',
              'main.version': '2.0.0',
              'main.twitter': '@lama',
              'main.facebook': 'facebook',
              'main.theme': 'readable'
            }[key];
          }
        };
      }
    });

    const app = {
      get: function(pathname) {
        if (pathname === '/profile') {
          var handlers = Array.prototype.slice.call(arguments, 1);
          handlers[handlers.length - 1](req, res);
        }
      },
      post: function() {},
      delete: function() {},
      use: function() {}
    };

    await routeModule.initialize(app, {
      authenticate: function() {
        return function() {};
      }
    });

    await new Promise(function(resolve) {
      setTimeout(resolve, 25);
    });

      expect(renderCalls.length).to.equal(1);
      expect(renderCalls[0].view).to.equal('profile');
      expect(renderCalls[0].model.user).to.deep.equal({ local: { email: 'alice@example.com', name: 'Alice' } });
  });

  it('renders the admin edit profile page after the selected user lookup resolves', async function() {
    const renderCalls = [];
    const req = {
      params: { user_id: 'alice@example.com' },
      user: {
        local: { email: 'admin@example.com', admin: true }
      },
      isAuthenticated: () => true,
      flash: () => [],
      session: {}
    };
    const res = {
      render: function(view, model) {
        renderCalls.push({ view, model });
      },
      redirect: function(url) {
        throw new Error('redirect called unexpectedly: ' + url);
      },
      clearCookie: function() {},
      cookie: function() {},
      status: function() { return this; },
      send: function() {}
    };

    const userModel = {
      findOne: function(query) {
        return {
          lean: function() {
            return {
              exec: function() {
                return Promise.resolve({
                  local: { email: 'alice@example.com', name: 'Alice' }
                });
              }
            };
          }
        };
      }
    };

    const tools = {
      loadCurrentUser: function(request, callback) {
        callback(null, { local: { email: 'admin@example.com', name: 'Admin' } });
      },
      getSettings: function(viewModel, response, page) {
        expect(viewModel.userAdmin).to.deep.equal({ local: { email: 'alice@example.com', name: 'Alice' } });
        response.render(page, viewModel);
      }
    };

    const routeModule = proxyquire('../server/routes', {
      '../models/user': userModel,
      '../models/settings': { findOne: function() { return { exec: () => Promise.resolve({ newUsers: true }) }; } },
      '../server/tools.js': tools,
      'connect-flash': function() { return function() {}; },
      'node-persist': {
        init: async function() {},
        getItem: async function() { return null; },
        setItem: async function() { return null; }
      },
      'properties-reader': function() {
        return {
          get: function(key) {
            return {
              'admin.settingsID': 'settings-1',
              'main.lamaTitle': 'Lama',
              'main.version': '2.0.0',
              'main.twitter': '@lama',
              'main.facebook': 'facebook',
              'main.theme': 'readable'
            }[key];
          }
        };
      }
    });

    const app = {
      get: function(pathname) {
        if (pathname === '/editProfileAdmin/:user_id') {
          var handlers = Array.prototype.slice.call(arguments, 1);
          handlers[handlers.length - 1](req, res);
        }
      },
      post: function() {},
      delete: function() {},
      use: function() {}
    };

    await routeModule.initialize(app, {
      authenticate: function() {
        return function() {};
      }
    });

    await new Promise(function(resolve) {
      setTimeout(resolve, 25);
    });

    expect(renderCalls.length).to.equal(1);
    expect(renderCalls[0].view).to.equal('editProfileAdmin');
    expect(renderCalls[0].model.userAdmin.local.email).to.equal('alice@example.com');
  });
});
