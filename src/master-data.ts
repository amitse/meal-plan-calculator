import rawMasterData from "../data/master-data.json" with { type: "json" };
import type { ExchangeGroup, ExchangeOption, FoodItem, Id, MasterData, ReferenceFormula } from "./types.js";

export const masterData = rawMasterData as MasterData;

export function listFoodItems(data: MasterData = masterData): readonly FoodItem[] {
  return data.foods;
}

export function listExchangeGroups(data: MasterData = masterData): readonly ExchangeGroup[] {
  return data.exchangeGroups;
}

export function listReferenceFormulas(data: MasterData = masterData): readonly ReferenceFormula[] {
  return data.referenceFormulas;
}

export function findFoodItem(id: Id, data: MasterData = masterData): FoodItem | undefined {
  return data.foods.find((food) => food.id === id);
}

export function getFoodItem(id: Id, data: MasterData = masterData): FoodItem {
  return getById(data.foods, id, "FoodItem");
}

export function findExchangeGroup(id: Id, data: MasterData = masterData): ExchangeGroup | undefined {
  return data.exchangeGroups.find((group) => group.id === id);
}

export function getExchangeGroup(id: Id, data: MasterData = masterData): ExchangeGroup {
  return getById(data.exchangeGroups, id, "ExchangeGroup");
}

export function listExchangeOptions(groupId: Id, data: MasterData = masterData): readonly ExchangeOption[] {
  return getExchangeGroup(groupId, data).options;
}

export function findExchangeOption(
  groupId: Id,
  optionId: Id,
  data: MasterData = masterData,
): ExchangeOption | undefined {
  return findExchangeGroup(groupId, data)?.options.find((option) => option.id === optionId);
}

export function getExchangeOption(groupId: Id, optionId: Id, data: MasterData = masterData): ExchangeOption {
  const option = findExchangeOption(groupId, optionId, data);

  if (!option) {
    throw new Error(`ExchangeOption not found: ${groupId}/${optionId}`);
  }

  return option;
}

export function findReferenceFormula(id: Id, data: MasterData = masterData): ReferenceFormula | undefined {
  return data.referenceFormulas.find((formula) => formula.id === id);
}

export function getReferenceFormula(id: Id, data: MasterData = masterData): ReferenceFormula {
  return getById(data.referenceFormulas, id, "ReferenceFormula");
}

export function assertUniqueMasterDataIds(data: MasterData = masterData): true {
  assertUniqueIds("FoodItem", data.foods);
  assertUniqueIds("ExchangeGroup", data.exchangeGroups);
  assertUniqueIds("ReferenceFormula", data.referenceFormulas);

  for (const group of data.exchangeGroups) {
    assertUniqueIds(`ExchangeOption in ${group.id}`, group.options);
  }

  return true;
}

export function assertMasterDataReferences(data: MasterData = masterData): true {
  const foodIds = new Set(data.foods.map((food) => food.id));

  for (const food of data.foods) {
    if (!food.dietaryLevel) {
      throw new Error(`FoodItem ${food.id} is missing dietaryLevel`);
    }
  }

  for (const group of data.exchangeGroups) {
    if (group.reference?.foodItemId && !foodIds.has(group.reference.foodItemId)) {
      throw new Error(`ExchangeGroup ${group.id} references unknown FoodItem: ${group.reference.foodItemId}`);
    }

    for (const option of group.options) {
      if (option.foodItemId && !foodIds.has(option.foodItemId)) {
        throw new Error(`ExchangeOption ${group.id}/${option.id} references unknown FoodItem: ${option.foodItemId}`);
      }

      if (!option.foodItemId && !option.dietaryLevel) {
        throw new Error(`ExchangeOption ${group.id}/${option.id} is missing dietaryLevel`);
      }
    }
  }

  return true;
}

export function assertMasterDataIntegrity(data: MasterData = masterData): true {
  assertUniqueMasterDataIds(data);
  assertMasterDataReferences(data);

  return true;
}

function getById<T extends { id: Id }>(items: readonly T[], id: Id, kind: string): T {
  const item = items.find((candidate) => candidate.id === id);

  if (!item) {
    throw new Error(`${kind} not found: ${id}`);
  }

  return item;
}

function assertUniqueIds(kind: string, items: readonly { id: Id }[]): void {
  const seen = new Set<Id>();
  const duplicates = new Set<Id>();

  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.add(item.id);
    }

    seen.add(item.id);
  }

  if (duplicates.size > 0) {
    throw new Error(`${kind} duplicate ids: ${Array.from(duplicates).join(", ")}`);
  }
}
