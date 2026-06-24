export const TERMINAL_PIPELINE_STAGES = new Set([
  "assembled",
  "ready_to_ship", 
  "shipped",
]);

export const OVERVIEW_LANE_READY_TO_SHIP = "ready_to_ship";
export const OVERVIEW_LANE_SHIPPED = "shipped";
export const OVERVIEW_LANE_WORKSHOP_COMPLETE = "workshop_complete";
export const OVERVIEW_LANE_ASSEMBLED = "assembled";
export const OVERVIEW_POST_PRODUCTION_LANE_IDS = [
  OVERVIEW_LANE_READY_TO_SHIP, 
  OVERVIEW_LANE_SHIPPED
];
