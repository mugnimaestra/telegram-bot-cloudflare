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

// Initialize with a copy of default config instead of null
let configCache: RSCMConfig = { ...DEFAULT_CONFIG };

/**
 * Load configuration from environment with fallback to defaults.
 * Applies RSCM_CONFIG first, then overrides with individual env vars.
 */
export function loadConfig(env?: Env): RSCMConfig {
  try {
    let baseConfig = { ...DEFAULT_CONFIG }; // Start with defaults

    // Try to merge config from RSCM_CONFIG environment variable
    const envConfig = env?.RSCM_CONFIG;
    if (envConfig) {
      try {
        const userConfig = JSON.parse(envConfig);
        // Merge parsed config with defaults
        baseConfig = {
          ...DEFAULT_CONFIG,
          ...userConfig,
          services: {
            ...DEFAULT_CONFIG.services,
            ...(userConfig.services || {}),
          },
        };
      } catch (parseError) {
        console.warn(
          "Failed to parse RSCM_CONFIG environment variable, proceeding with defaults before individual overrides:",
          parseError
        );
        // Keep baseConfig as DEFAULT_CONFIG if parse fails
      }
    }

    // Apply individual environment variables, overriding baseConfig (defaults or parsed RSCM_CONFIG)
    configCache = {
      ...baseConfig, // Start with base config
      api_url: env?.RSCM_API_URL || baseConfig.api_url,
      check_interval_seconds: env?.RSCM_CHECK_INTERVAL
        ? parseInt(env.RSCM_CHECK_INTERVAL, 10)
        : baseConfig.check_interval_seconds,
    };

    // Merge services from RSCM_SERVICES if present, overriding existing services
    if (env?.RSCM_SERVICES) {
      try {
        const envServices = JSON.parse(env.RSCM_SERVICES);
        configCache.services = { ...configCache.services, ...envServices };
      } catch (serviceParseError) {
        console.warn(
          "Failed to parse RSCM_SERVICES environment variable:",
          serviceParseError
        );
      }
    }

    return configCache;
  } catch (error) {
    console.error("Unexpected error loading RSCM config, resetting to defaults:", error);
    configCache = { ...DEFAULT_CONFIG }; // Reset to default on unexpected error
    return configCache;
  }
}
