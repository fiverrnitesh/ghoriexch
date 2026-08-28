module.exports = {
  apps: [
    {
      name: 'games-api',
      script: 'apps/api/dist/index.js',
      cwd: './',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      instances: 'max',
      exec_mode: 'fork',
      max_memory_restart: '500M',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
    },
  ],
};
