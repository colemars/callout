import type { ApiEvent, TranslatedEvent } from "@platform/ui";
import { computeAge } from "./ages";
import { buildChronicle } from "./chronicle";
import { computeMoat } from "./moat";
import { computeResources } from "./resources";
import { computeStructures } from "./structures";
import { computeThreats } from "./threats";
import type { KingdomInput, KingdomState } from "./types";

/** Pure composition: real financial data in, living kingdom out. */
export function kingdomModel(
  input: KingdomInput,
  translateEvent: (e: ApiEvent) => TranslatedEvent,
): KingdomState {
  const age = computeAge(input);
  const resources = computeResources(input);
  const moat = computeMoat(input);
  const threats = computeThreats(input);
  const structures = computeStructures(input, age, resources, moat);
  const chronicle = buildChronicle(input, translateEvent);

  return {
    asOf: input.today,
    age,
    resources,
    structures,
    threats,
    moat,
    chronicle,
    surveying: input.metrics === null,
  };
}

export type { KingdomInput, KingdomState } from "./types";
