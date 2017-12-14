import { types } from 'mobx-state-tree';
import * as uuid from 'uuid/v4';

const ValueType = types.union(types.number, types.string, types.undefined);
export type IValueType = number | string | undefined;

export const Attribute = types.model('Attribute', {
  id: types.identifier(types.string),
  clientKey: types.optional(types.string, ''),
  sourceID: types.maybe(types.string),
  name: types.string,
  hidden: types.optional(types.boolean, false),
  units: types.optional(types.string, ''),
  formula: types.optional(types.string, ''),
  values: types.optional(types.array(ValueType), [])
}).preProcessSnapshot((snapshot) => {
  const { id, ...others } = snapshot;
  return { id: id || uuid(), ...others };
}).views(self => ({
  get length() {
    return self.values.length;
  },
  value(index: number) {
    return self.values[index];
  },
  derive(name?: string) {
    return { id: self.id, name: name || self.name, units: self.units, values: [] };
  }
})).actions(self => ({
  setName(newName: string) {
    self.name = newName;
  },
  setUnits(units: string) {
    self.units = units;
  },
  addValue(value: IValueType, beforeIndex?: number) {
    if ((beforeIndex != null) && (beforeIndex < self.values.length)) {
      self.values.splice(beforeIndex, 0, value);
    }
    else {
      self.values.push(value);
    }
  },
  addValues(values: IValueType[], beforeIndex?: number) {
    if ((beforeIndex != null) && (beforeIndex < self.values.length)) {
      self.values.splice.apply(self.values, [beforeIndex, 0, ...values]);
    }
    else {
      self.values.push.apply(self.values, values);
    }
  },
  setValue(index: number, value: IValueType) {
    if ((index >= 0) && (index < self.values.length)) {
      self.values[index] = value;
    }
  },
  setValues(indices: number[], values: IValueType[]) {
    const length = indices.length <= values.length ? indices.length : values.length;
    for (let i = 0; i < length; ++i) {
      const index = indices[i];
      if ((index >= 0) && (index < self.values.length)) {
        self.values[index] = values[i];
      }
    }
  },
  removeValues(index: number, count: number = 1) {
    if ((index != null) && (index < self.values.length) && (count > 0)) {
      self.values.splice(index, count);
    }
  }
}));
export type IAttribute = typeof Attribute.Type;
export type IAttributeSnapshot = typeof Attribute.SnapshotType;
