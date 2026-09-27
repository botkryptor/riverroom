import {
  defineRailway,
  github,
  postgres,
  project,
  service,
  volume,
} from "railway/iac";

const region = "asia-southeast1-eqsg3a";

export default defineRailway(() => {
  const roomData = volume("room-data", {
    region,
    sizeMB: 500,
  });
  const database = postgres("database", { region });

  const web = service("web", {
    source: github("botkryptor/riverroom", {
      branch: "main",
    }),
    build: {
      builder: "RAILPACK",
    },
    start: "npm start",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    replicas: {
      [region]: 1,
    },
    env: {
      DATABASE_URL: database.env.DATABASE_URL,
      DATA_DIR: "/app/data",
      NODE_ENV: "production",
    },
    volumeMounts: {
      "/app/data": roomData,
    },
  });

  return project("riverroom", {
    resources: [database, roomData, web],
  });
});
