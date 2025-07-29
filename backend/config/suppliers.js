module.exports = {
  suppliers: {
    clickadilla: {
      enabled: true,
      timeout: 10000,
      retries: 3,
      url: 'https://core.clickadilla.com/api',
      endpoints: {
        budget: '/v1/profile',
        stats: '/v1/feed-statistics'
      }
    },
    exoclick: {
      enabled: true,
      timeout: 12000,
      retries: 2,
      url:'https://api.exoclick.com',
      endpoints: {
        auth: '/v2/login',
        budget: '/v2/user',
        stats: '/v2/statistics/a/date'
      }
    },
    hilltopads: {
      enabled: true,
      timeout: 10000,
      retries: 3,
      url:'https://hilltopads.com/api',
      endpoints: {
        budget: '/advertiser/balance'
      }
    },
    kadam: {
      enabled: true,
      timeout: 15000,
      retries: 2,
      url: 'http://api.kadam.net',
      endpoints: {
        budget: '/ads.clients.balance.get',
        stats: '/ads.stats.campaign.get'
      }
    },
    onclicka: {
      enabled: true,
      timeout: 10000,
      retries: 3,
      url:"https://core.onclicka.com/api/v1",
      endpoints: {
        budget: '/profile',
        stats: '/feed-statistics'
      }
    },
    trafficjunky: {
      enabled: true,
      timeout: 12000,
      retries: 2,
      endpoints: {
        budget: '/v2/budget',
        stats: '/v2/stats',
        offers: '/v2/offers',
        campaigns: '/v2/campaigns'
      }
    },
    trafficshop: {
      enabled: true,
      timeout: 10000,
      retries: 3,
      url:'https://api.trafficshop.com',
      endpoints: {
        budget: '/v1/advertisers/me',
        stats: '/v1/advertisers/analytics'
      }
    },
    trafficstars: {
      enabled: true,
      timeout: 15000,
      retries: 2,
      url:'https://api.trafficstars.com',
      endpoints: {
        auth: '/v1/auth/token',
        budget:'/v2/userinfo/balance',
        stats: '/v1.1/rtb-client/custom/report/by-day'
      }
    },
    twinred: {
      enabled: true,
      timeout: 10000,
      retries: 3,
      url: 'https://control.twinred.com/api',
      endpoints: {
        auth: '/v1/oauth2/token',
        stats: '/v1/stats/advertisers/18509'
      }
    }
  },
  cache: {
    ttl: 43200, // 12 hours
    key_prefix: 'supplier'
  },
  currency: {
    base: 'USD',
    rates_api: 'https://api.exchangerate-api.com/v4/latest/USD'
  }
};