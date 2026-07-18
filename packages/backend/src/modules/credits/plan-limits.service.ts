import { getRedisClient } from '../../lib/redis.js';

/**
 * Hardcoded fallback limits (used when Redis is unavailable or standalone mode)
 */
const FALLBACK_LIMITS: Record<string, PlanLimits> = {
  PLAN_BASICO: { creditos: 100, downloads: 3, usuarios: 5 },
  PLAN_PRO: { creditos: 500, downloads: 10, usuarios: 20 },
  PLAN_ENTERPRISE: { creditos: -1, downloads: -1, usuarios: -1 },
};

export interface PlanLimits {
  creditos: number;
  downloads: number;
  usuarios: number;
}

/**
 * Get plan limits from Redis (populated by License Service PlanCacheWarmupService).
 * Falls back to hardcoded defaults if Redis is unavailable.
 *
 * Redis key: plan:{planType}:limits → HASH { creditos, downloads, usuarios }
 */
export async function getPlanLimits(planType: string | undefined): Promise<PlanLimits> {
  if (!planType) return FALLBACK_LIMITS.PLAN_BASICO;

  try {
    const redis = getRedisClient();
    const key = `plan:${planType}:limits`;
    const data = await redis.hgetall(key);

    if (data && data.creditos) {
      return {
        creditos: parseInt(data.creditos, 10),
        downloads: parseInt(data.downloads, 10),
        usuarios: parseInt(data.usuarios, 10),
      };
    }
  } catch {
    // Redis unavailable — use fallback
  }

  return FALLBACK_LIMITS[planType] ?? FALLBACK_LIMITS.PLAN_BASICO;
}

/**
 * Get the max free downloads for a plan.
 * Returns Infinity for unlimited plans (-1 in DB).
 */
export async function getMaxFreeDownloads(planType: string | undefined): Promise<number> {
  const limits = await getPlanLimits(planType);
  return limits.downloads === -1 ? Infinity : limits.downloads;
}

/**
 * Check if a role is authorized for a plan by querying Redis.
 * Redis key: plan:{planType}:roles → SET of role strings
 * Falls back to hardcoded if Redis unavailable.
 */
export async function isRoleInPlan(role: string, planType: string | undefined): Promise<boolean> {
  if (!planType) return true;

  try {
    const redis = getRedisClient();
    const key = `plan:${planType}:roles`;
    const isMember = await redis.sismember(key, role);
    return isMember === 1;
  } catch {
    // Redis unavailable — use fallback from plan-role.guard
    const { isRoleAuthorizedByPlan } = await import('../users/plan-role.guard.js');
    return isRoleAuthorizedByPlan(role, planType, false);
  }
}
