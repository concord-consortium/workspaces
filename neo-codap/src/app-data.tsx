import { types } from 'mobx-state-tree';
import { CaseTableComponentData } from './case-table/case-table';
import { GraphComponentData } from './graph/graph';

export const AppComponentData = types.model('AppComponentData', {
  caseTableData: types.maybe(CaseTableComponentData),
  graphData: types.maybe(GraphComponentData)
});
export type IAppComponentData = typeof AppComponentData.Type;

export const createDefaultAppComponentData = () => {
  return AppComponentData.create({
    caseTableData: {
      sortModel: []
    },
    graphData: {
      xAttrID: null,
      yAttrID: null,
      legendAttrID: null
    }
  });
};