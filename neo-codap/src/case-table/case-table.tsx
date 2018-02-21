import * as React from 'react';
import { ISerializedActionCall } from 'mobx-state-tree/dist/middlewares/on-action';
import TableHeaderMenu from './table-header-menu';
import { addAttributeToDataSet, addCanonicalCasesToDataSet,
         ICase, IInputCase, IDataSet } from '../data-manager/data-manager';
import { IAttribute, IValueType } from '../data-manager/attribute';
import { AgGridReact } from 'ag-grid-react';
import { GridReadyEvent, GridApi, CellComp, ColDef, ColumnApi, RowRenderer } from 'ag-grid';
import { ValueGetterParams, ValueFormatterParams, ValueSetterParams } from 'ag-grid/dist/lib/entities/colDef';
import { assign, cloneDeep, findIndex, isEqual } from 'lodash';
import 'ag-grid/dist/styles/ag-grid.css';
import 'ag-grid/dist/styles/ag-theme-fresh.css';
import './case-table.css';

interface ICaseTableProps {
  dataSet?: IDataSet;
  onSampleData?: (name: string) => void;
}

interface ICaseTableState {
  rowSelection: string;
  rowModelType: string;
}

const LOCAL_CASE_ID = '__local__';
const LOCAL_CASE_ROW_STYLE = {backgroundColor: '#afa'};

interface IRowStyleParams {
  data: {
    id: string;
  };
}

// default widths for sample data sets
const widths: { [key: string]: number } = {
        animal_id: 75,
        species: 100,
        day: 50,
        month: 70,
        longitude: 75,
        temperature: 90,
        chlorophyll: 80,
        curviness: 75,

        Mammal: 180,
        Order: 140,
        LifeSpan: 100,
        Habitat: 100
      },
      defaultWidth = 80;

const prevOnTabKeyDown = RowRenderer.prototype.onTabKeyDown;
// monkey-patch tab key handling to always stop editing
RowRenderer.prototype.onTabKeyDown = function (previousRenderedCell: CellComp, keyboardEvent: KeyboardEvent) {
  prevOnTabKeyDown.call(this, previousRenderedCell, keyboardEvent);
  // tab key always stops editing, even if not moving to next cell
  if (previousRenderedCell.isEditing()) {
    previousRenderedCell.stopEditing();
  }
};

export class CaseTable extends React.Component<ICaseTableProps, ICaseTableState> {

  gridApi: GridApi;
  gridColumnApi: ColumnApi;

  gridColumnDefs: ColDef[] = [];
  gridRowData: (ICase | undefined)[] = [];
  localCase: ICase = {};
  checkForEnterAfterCellEditingStopped = false;
  checkForEnterAfterLocalDataEntry = false;

  // we don't need to refresh for changes the table already knows about
  localChanges: IInputCase[] = [];

  constructor(props: ICaseTableProps) {
    super(props);

    const { dataSet } = this.props;
    this.attachDataSet(dataSet);

    this.state = {
      rowSelection: 'multiple',
      rowModelType: 'inMemory',
    };

    this.updateGridState(dataSet);
  }

  onGridReady = (gridReadyParams: GridReadyEvent) => {
    this.gridApi = gridReadyParams.api;
    this.gridColumnApi = gridReadyParams.columnApi;
  }

  getRowNodeId = (data: { id: string }) => data.id;

  getCaseIndexColumnDef(): ColDef {
    return ({
      headerName: '',
      // tslint:disable-next-line:no-any
      headerComponentFramework: TableHeaderMenu as (new () => any),
      headerComponentParams: {
        dataSet: this.props.dataSet,
        gridApi: this.gridApi,
        onNewAttribute: (name: string) => {
          if (this.props.dataSet) {
            addAttributeToDataSet(this.props.dataSet, { name });
          }
        },
        onNewCase: () => {
          if (this.props.dataSet) {
            addCanonicalCasesToDataSet(this.props.dataSet, [{}]);
          }
        },
        onRemoveAttribute: (id: string) => {
          if (this.props.dataSet) {
            this.props.dataSet.removeAttribute(id);
          }
        },
        onRemoveCases: (ids: string[]) => {
          if (this.props.dataSet) {
            this.props.dataSet.removeCases(ids);
          }
        },
        onSampleData: this.props.onSampleData
      },
      headerClass: 'cdp-case-index-header',
      cellClass: 'cdp-case-index-cell',
      colId: '__CASE_INDEX__',
      width: 50,
      pinned: 'left',
      valueGetter: 'String(node.rowIndex + 1)',
      suppressMovable: true,
      suppressResize: true,
      suppressNavigable: true
    });
  }

  addLocalCaseToTable() {
    const {dataSet} = this.props;
    if (!dataSet) {
      return;
    }

    // clear local case before adding so that the update caused by addCanonicalCasesToDataSet()
    // shows an empty row for the local case
    const newCase: ICase = cloneDeep(this.localCase);
    this.localCase = {};
    addCanonicalCasesToDataSet(dataSet, [newCase]);
  }

  getAttributeColumnDef(attribute: IAttribute): ColDef {
    return ({
      headerName: attribute.name,
      field: attribute.name,
      tooltipField: attribute.name,
      colId: attribute.id,
      editable: true,
      width: widths[attribute.name] || defaultWidth,
      valueGetter: (params: ValueGetterParams) => {
        const { dataSet } = this.props,
              caseID = params.node.id,
              attrID = params.colDef.colId;
        if (params.data.id === LOCAL_CASE_ID) {
          return attrID ? this.localCase[attrID] : undefined;
        }
        let value = dataSet && attrID ? dataSet.getValue(caseID, attrID) : undefined;
        // valueGetter includes in-flight changes
        this.localChanges.forEach((change) => {
          if ((change.__id__ === caseID) && (attrID != null)) {
            if (change[attrID] != null) {
              value = change[attrID] as IValueType;
            }
          }
        });
        return value;
      },
      valueFormatter: (params: ValueFormatterParams) => {
        const colName = params.colDef.field || params.colDef.headerName || '',
              colPlaces: { [key: string]: number } = {
                day: 0,
                distance: 1,
                speed: 2
              },
              places = colPlaces[colName];
        return (places != null) && (typeof params.value === 'number')
                  ? params.value.toFixed(places)
                  : params.value;
      },
      valueSetter: (params: ValueSetterParams) => {
        const { dataSet } = this.props;
        if (!dataSet || (params.newValue === params.oldValue)) { return false; }
        if (params.data.id === LOCAL_CASE_ID) {
          if (params.colDef.colId) {
            this.localCase[params.colDef.colId] = params.newValue;
            this.checkForEnterAfterLocalDataEntry = true;
          }
          return !!params.colDef.colId;
        }
        const str = params.newValue && (typeof params.newValue === 'string')
                      ? params.newValue.trim() : undefined,
              num = str ? Number(str) : undefined,
              attrID = attribute.id,
              caseID = dataSet && dataSet.cases[params.node.rowIndex].__id__,
              caseValues = {
                __id__: caseID,
                [attrID]: (num != null) && isFinite(num) ? num : str
              };
        if (caseValues[attrID] === params.oldValue) { return false; }
        // track in-flight changes
        this.localChanges.push(cloneDeep(caseValues));
        dataSet.setCanonicalCaseValues([caseValues]);
        return true;
      }
    });
  }

  getColumnDefs(dataSet: IDataSet) {
    let cols: ColDef[];
    cols = dataSet.attributes.map((attr) =>
      this.getAttributeColumnDef(attr)
    );
    cols.unshift(this.getCaseIndexColumnDef());
    return cols;
  }

  getRowData(dataSet: IDataSet) {
    const rows = [];
    for (let i = 0; i < dataSet.cases.length; ++i) {
      // just need the ID; everything else comes from valueGetter
      rows.push({ id: dataSet.cases[i].__id__ });
    }
    return rows;
  }

  updateGridState(dataSet?: IDataSet) {
    this.gridColumnDefs = dataSet ? this.getColumnDefs(dataSet) : [];
    this.gridRowData = dataSet ? this.getRowData(dataSet) : [];
    if (this.gridApi) {
      this.gridRowData.push({id: LOCAL_CASE_ID});
      this.gridApi.setRowData(this.gridRowData);
      setTimeout(() => this.ensureFocus(dataSet));
    }
  }

  ensureFocus = (dataSet?: IDataSet) => {
    const currentCell = this.gridApi.getFocusedCell();
    const lastRowIndex = this.gridApi.paginationGetRowCount() - 1;
    if (!currentCell && (lastRowIndex >= 0) && dataSet && (dataSet.attributes.length > 0)) {
      const firstColId = dataSet.attributes[0].id;
      this.gridApi.setFocusedCell(lastRowIndex, firstColId);
    }
  }

  focusOnNextRow = () => {
    const currentCell = this.gridApi.getFocusedCell();
    if (currentCell) {
      this.gridApi.setFocusedCell(currentCell.rowIndex + 1, currentCell.column.getColId());
    }
  }

  getRowStyle(params: IRowStyleParams) {
    if (params.data.id === LOCAL_CASE_ID) {
      return LOCAL_CASE_ROW_STYLE;
    }
    return undefined;
  }

  isIgnorableChange(action: ISerializedActionCall) {
    switch (action.name) {
      case 'setCaseValues':
      case 'setCanonicalCaseValues': {
        const cases = action.args && action.args[0];
        if (!cases) { return true; }
        let ignoredChanges = 0;
        cases.forEach((aCase: IInputCase) => {
          const index = findIndex(this.localChanges, (change) => isEqual(assign({}, aCase, change), aCase));
          if (index >= 0) {
            // ignoring local change
            this.localChanges.splice(index, 1);
            ++ignoredChanges;
          }
        });
        return ignoredChanges >= cases.length;
      }
      case 'addActionListener':
      case 'removeActionListener':
        return true;
      default:
        return false;
    }
  }

  attachDataSet(dataSet?: IDataSet) {
    if (dataSet) {
      dataSet.addActionListener('case-table', (action) => {
        if (!this.isIgnorableChange(action)) {
          this.updateGridState(dataSet);
          this.forceUpdate();
        }
      });
    }
  }

  detachDataSet(dataSet?: IDataSet) {
    if (dataSet) {
      dataSet.removeActionListener('case-table');
    }
  }

  handleRowSelectionChanged = () => {
    if (this.gridApi) {
      this.gridApi.refreshHeader();
    }
  }

  handleCellEditingStopped = () => {
    this.checkForEnterAfterCellEditingStopped = true;
  }

  handleKeyUp = (e: KeyboardEvent) => {
    if (e.keyCode === 13) {
      if (this.checkForEnterAfterLocalDataEntry) {
        this.addLocalCaseToTable();
        setTimeout(this.focusOnNextRow);
      }
      else if (this.checkForEnterAfterCellEditingStopped) {
        setTimeout(this.focusOnNextRow);
      }
    }

    this.checkForEnterAfterLocalDataEntry = false;
    this.checkForEnterAfterCellEditingStopped = false;
  }

  componentWillMount() {
    window.addEventListener('keyup', this.handleKeyUp);
  }

  componentWillUnmount() {
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  componentWillReceiveProps(nextProps: ICaseTableProps) {
    const { dataSet } = nextProps;
    if (dataSet !== this.props.dataSet) {
      this.detachDataSet(this.props.dataSet);
      this.attachDataSet(dataSet);
      this.updateGridState(dataSet);
    }
  }

  componentWillReact() {
    this.updateGridState(this.props.dataSet);
  }

  render() {
    return (
      <div className="neo-codap-case-table ag-theme-fresh">
        <AgGridReact
          columnDefs={this.gridColumnDefs}
          enableColResize={true}
          getRowNodeId={this.getRowNodeId}
          debug={false}
          rowSelection={this.state.rowSelection}
          rowDeselection={true}
          onSelectionChanged={this.handleRowSelectionChanged}
          rowModelType={this.state.rowModelType}
          rowData={this.gridRowData}
          deltaRowDataMode={false}
          onGridReady={this.onGridReady}
          suppressDragLeaveHidesColumns={true}
          getRowStyle={this.getRowStyle}
          onCellEditingStopped={this.handleCellEditingStopped}
        />
      </div>
    );
  }
}
