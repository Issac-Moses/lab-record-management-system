import gamificationService from "./gamificationService.cjs";

export const {
  getUserProgress,
  addXP,
  incrementLabCompletion,
  getLeaderboard,
  computeLevel,
  LEVEL_DIVISOR,
  LAB_COMPLETION_XP_REWARD,
} = gamificationService;

export default gamificationService;
