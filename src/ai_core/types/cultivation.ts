export interface CultivationInput {
  gongfaIndex: number;
  gongfaName: string;
  gongfaGrade: string;
  gongfaSystem: string;
  currentMastery: number;
  currentMasteryExp: number;
  masteryThreshold: number;
  spiritStoneCount: number;
  estimatedMonths: number;
}

export interface CultivationConfirmPayload {
  spiritStoneCount: number;
  estimatedMonths: number;
}
