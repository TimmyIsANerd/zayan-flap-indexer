module.exports = {
  apps: [
    {
      name: "zayan-flap-indexer",
      script: "./src/index.ts",
      interpreter: "bun",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
