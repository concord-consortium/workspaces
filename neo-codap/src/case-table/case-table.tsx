import * as React from 'react';
import { ISerializedActionCall } from 'mobx-state-tree/dist/middlewares/on-action';
import TableHeaderMenu from './table-header-menu';
import { addAttributeToDataSet, addCanonicalCasesToDataSet,
         ICase, IInputCase, IDataSet } from '../data-manager/data-manager';
import { IAttribute, IValueType } from '../data-manager/attribute';
import { AgGridReact } from 'ag-grid-react';
import { CellComp, CellEditingStartedEvent, CellEditingStoppedEvent, ColDef, Column,
          ColumnApi, GridApi, GridReadyEvent, RowRenderer, RowNode } from 'ag-grid';
import { ValueGetterParams, ValueFormatterParams, ValueSetterParams } from 'ag-grid/dist/lib/entities/colDef';
import { assign, cloneDeep, findIndex, isEqual, sortedIndexBy } from 'lodash';
import 'ag-grid/dist/styles/ag-grid.css';
import 'ag-grid/dist/styles/ag-theme-fresh.css';
import './case-table.css';
import { RowDataTransaction } from 'ag-grid/dist/lib/rowModels/inMemory/inMemoryRowModel';
import { Strings } from '../strings';
import { CaseTableHeader } from './case-table-header';

interface ICaseTableProps {
  dataSet?: IDataSet;
  onSampleData?: (name: string) => void;
  strings: Strings;
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

interface IGridRow {
  id: string;
}

interface IGridCellDef {
  rowIndex?: number;
  column?: Column;
  floating?: string;
}

interface ICellIDs {
  attrID?: string;
  caseID?: string;
  floating?: string;
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
  gridRowData: (IGridRow | undefined)[] = [];
  localCase: ICase = {};
  checkForEnterAfterCellEditingStopped = false;
  checkForEnterAfterLocalDataEntry = false;

  editCellEvent?: CellEditingStartedEvent;
  savedFocusedCell?: ICellIDs;
  savedEditCell?: ICellIDs;
  savedEditContent?: string;

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
        onRenameAttribute: (id: string, name: string) => {
          if (this.props.dataSet) {
            //addAttributeToDataSet(this.props.dataSet, { name });
            alert("TODO: implement rename attribute")
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
        onSampleData: this.props.onSampleData,
        strings: this.props.strings
      },
      headerClass: 'cdp-case-index-header',
      cellClass: 'cdp-case-index-cell',
      colId: '__CASE_INDEX__',
      width: 50,
      pinned: 'left',
      lockPosition: true,
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
        const str = (params.newValue != null) && (typeof params.newValue === 'string')
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

  getRowData(dataSet?: IDataSet): IGridRow[] {
    const rows = [];
    if (dataSet) {
      for (let i = 0; i < dataSet.cases.length; ++i) {
        // just need the ID; everything else comes from valueGetter
        rows.push({ id: dataSet.cases[i].__id__ });
      }
    }
    rows.push({id: LOCAL_CASE_ID});
    return rows;
  }

  updateGridState(dataSet?: IDataSet) {
    this.gridColumnDefs = dataSet ? this.getColumnDefs(dataSet) : [];
    this.gridRowData = this.getRowData(dataSet);
    if (this.gridApi) {
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

  getCellIDsFromGridCell(cell: IGridCellDef): ICellIDs | undefined {
    if (!cell) { return; }
    const { rowIndex, column, floating } = cell,
          attrID = column && column.getColId(),
          aCase = rowIndex != null ? this.gridRowData[rowIndex] : undefined,
          caseID = aCase && aCase.id;
    return attrID && caseID ? { attrID, caseID, floating } : undefined;
  }

  getGridCellFromCellIDs(cellIDs: ICellIDs): IGridCellDef | undefined {
    if (!cellIDs || !cellIDs.caseID) { return; }
    const rowNode = this.gridApi.getRowNode(cellIDs.caseID);
    return {
      rowIndex: rowNode.rowIndex,
      column: this.gridColumnApi.getColumn(cellIDs.attrID)
    };
  }

  saveCellEditState() {
    const focusedCell = this.gridApi.getFocusedCell(),
          rowIndex = this.editCellEvent && this.editCellEvent.rowIndex,
          column = this.editCellEvent && this.editCellEvent.column;
    this.savedFocusedCell = this.getCellIDsFromGridCell(focusedCell);
    this.savedEditCell = this.getCellIDsFromGridCell({ rowIndex, column });
    if (this.editCellEvent) {
      const cellInputElts = document.getElementsByClassName('ag-cell-edit-input'),
            cellInputElt: HTMLInputElement = cellInputElts && (cellInputElts[0] as HTMLInputElement);
      this.savedEditContent = cellInputElt ? cellInputElt.value : undefined;
    }
    this.gridApi.stopEditing(true);
    this.gridApi.clearFocusedCell();
  }

  restoreCellEditState() {
    if (this.savedFocusedCell) {
      const focusedGridCell = this.getGridCellFromCellIDs(this.savedFocusedCell);
      if (focusedGridCell) {
        const { rowIndex, column, floating } = focusedGridCell;
        if ((rowIndex != null) && column) {
          this.gridApi.setFocusedCell(rowIndex, column, floating);
        }
      }
      this.savedFocusedCell = undefined;
    }
    if (this.savedEditCell) {
      const editRowColumn = this.getGridCellFromCellIDs(this.savedEditCell);
      if (editRowColumn) {
        const { rowIndex, column } = editRowColumn;
        if ((rowIndex != null) && column) {
          this.gridApi.startEditingCell({ rowIndex, colKey: column });
        }
      }
      this.savedEditCell = undefined;
    }
    if (this.savedEditContent != null) {
      const cellInputElts = document.getElementsByClassName('ag-cell-edit-input'),
            cellInputElt: HTMLInputElement = cellInputElts && (cellInputElts[0] as HTMLInputElement);
      if (cellInputElt) {
        cellInputElt.value = this.savedEditContent;
      }
      this.savedEditContent = undefined;
    }
  }

  handleAction = (action: ISerializedActionCall) => {
    const { dataSet } = this.props;
    if (!this.isIgnorableChange(action)) {
      let columnDefs = null,
          rowTransaction: RowDataTransaction | null = null,
          shouldSaveEditState = true;
      switch (action.name) {
        case 'addAttributeWithID':
        case 'removeAttribute':
          if (dataSet) {
            columnDefs = this.getColumnDefs(dataSet);
          }
          break;
        case 'addCasesWithIDs':
        case 'addCanonicalCasesWithIDs':
        case 'setCaseValues':
        case 'setCanonicalCaseValues':
          if (action.args && action.args.length) {
            const cases = action.args[0].map((aCase: ICase) => ({ id: aCase.__id__ }));
            if (action.name.substr(0, 3) === 'add') {
              interface IRowData { id: string; }
              const addIndex = sortedIndexBy(this.gridRowData, cases[0], (value: IRowData) => value.id);
              rowTransaction = { add: cases, addIndex: Math.min(addIndex, this.gridRowData.length - 1) };
            }
            else {
              rowTransaction = { update: cases };
              // don't need to save/restore cell edit if only changing existing values
              shouldSaveEditState = false;
            }
          }
          break;
        case 'removeCases':
          if (action.args && action.args.length) {
            const casesToRemove = action.args[0].map((id: string) => ({ id }));
            rowTransaction = { remove: casesToRemove };
          }
          break;
        default:
      }
      if (shouldSaveEditState) {
        this.saveCellEditState();
      }
      if (columnDefs) {
        this.gridApi.setColumnDefs(columnDefs);
      }
      if (rowTransaction) {
        this.gridApi.updateRowData(rowTransaction);
        this.gridRowData = this.getRowData(dataSet);
      }
      if (shouldSaveEditState) {
        this.restoreCellEditState();
      }
    }
  }

  attachDataSet(dataSet?: IDataSet) {
    if (dataSet) {
      dataSet.addActionListener('case-table', this.handleAction);
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

  handleCellEditingStarted = (event: CellEditingStartedEvent) => {
    this.editCellEvent = cloneDeep(event);
  }

  handleCellEditingStopped = (event: CellEditingStoppedEvent) => {
    this.editCellEvent = undefined;
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

  handlePostSort = (rowNodes: RowNode[]) => {
    // move the entry row to the bottom
    const localRow = rowNodes.find((rowNode) => rowNode.data.id === LOCAL_CASE_ID);
    if (localRow) {
      rowNodes.splice(rowNodes.indexOf(localRow), 1);
      rowNodes.push(localRow);
    }
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
          enableCellChangeFlash={true}
          onCellEditingStarted={this.handleCellEditingStarted}
          onCellEditingStopped={this.handleCellEditingStopped}
          enableSorting={true}
          postSort={this.handlePostSort}
          frameworkComponents={{
            agColumnHeader: CaseTableHeader as (new () => any)
          }}
        />
      </div>
    );
  }
}
