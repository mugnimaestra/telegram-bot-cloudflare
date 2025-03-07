import { RSCMConfig } from "./types";

export const DEFAULT_CONFIG: RSCMConfig = {
  api_url: "https://www.rscm.co.id/apirscm/perjanjian.php",
  services: {
    "URJT Geriatri": {
      user_nm: "UMSI",
      key: "091ae7a29c4795860f69b4077e8b432c",
      poli_id: "2042",
      fungsi: "getJadwalDokter_dev",
    },
    "IPKT Jantung": {
      user_nm: "UMSI",
      key: "091ae7a29c4795860f69b4077e8b432c",
      poli_id: "97",
      fungsi: "getJadwalDokter_dev",
    },
  },
  check_interval_seconds: 600,
};

interface Env {
  RSCM_CONFIG?: string;
  RSCM_API_URL?: string;
  RSCM_CHECK_INTERVAL?: string;
  RSCM_SERVICES?: string;
}

let configCache: RSCMConfig | null = null;

/**
 * Load configuration from environment with fallback to defaults
 */
export function loadConfig(env?: Env): RSCMConfig {
  // Return cached config if available
  if (configCache) {
    return configCache;
  }

  try {
    // Try to get config from environment variable
    const envConfig = env?.RSCM_CONFIG;
    if (envConfig) {
      try {
        const userConfig = JSON.parse(envConfig);
        configCache = {
          ...DEFAULT_CONFIG,
          ...userConfig,
          services: {
            ...DEFAULT_CONFIG.services,
            ...(userConfig.services || {}),
          },
        };
        return configCache;
      } catch (parseError) {
        console.warn(
          "Failed to parse RSCM_CONFIG environment variable:",
          parseError
        );
      }
    }

    // Individual environment variables override
    configCache = {
      ...DEFAULT_CONFIG,
      api_url: env?.RSCM_API_URL || DEFAULT_CONFIG.api_url,
      check_interval_seconds: env?.RSCM_CHECK_INTERVAL
        ? parseInt(env.RSCM_CHECK_INTERVAL, 10)
        : DEFAULT_CONFIG.check_interval_seconds,
      services: {
        ...DEFAULT_CONFIG.services,
        ...(env?.RSCM_SERVICES ? JSON.parse(env.RSCM_SERVICES) : {}),
      },
    };
    return configCache;
  } catch (error) {
    console.warn("Error loading config, using defaults:", error);
    configCache = DEFAULT_CONFIG;
    return configCache;
  }
}
