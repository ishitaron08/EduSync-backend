import { MlRecommendationInput, MlRecommendationResponse } from "./ml.types";
import { mapLegacyInputToV2, mapV2ToLegacyResponse } from "../../ai/response-mapper";
import { runRecommender } from "../../ai/recommender-engine";
import { PredictV2Input, PredictV2Output } from "../../ai/types";

export const mlService = {
  async getRecommendation(input: MlRecommendationInput): Promise<MlRecommendationResponse> {
    const v2Input = mapLegacyInputToV2(input);
    const v2Result = runRecommender(v2Input);
    return mapV2ToLegacyResponse(v2Result.recommendation);
  },
  async getRecommendationV2(input: PredictV2Input): Promise<PredictV2Output> {
    return runRecommender(input);
  }
};
