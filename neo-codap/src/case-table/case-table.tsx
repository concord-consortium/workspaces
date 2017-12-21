import * as React from 'react';
import TableHeaderMenu from './table-header-menu';
import { addAttributeToDataSet, addCasesToDataSet, ICase, IDataSet } from '../data-manager/data-manager';
import { IAttribute } from '../data-manager/attribute';
import { AgGridReact } from 'ag-grid-react';
import { GridReadyEvent, GridApi, ColDef, ColumnApi } from 'ag-grid';
import { ValueGetterParams, ValueFormatterParams, ValueSetterParams } from 'ag-grid/dist/lib/entities/colDef';
import 'ag-grid/dist/styles/ag-grid.css';
import 'ag-grid/dist/styles/ag-theme-fresh.css';
import './case-table.css';
// import { ICellRendererParams } from 'ag-grid';

interface ICaseTableProps {
  dataSet?: IDataSet;
  onSampleData?: (name: string) => void;
}

interface ICaseTableState {
  rowSelection: string;
  rowModelType: string;
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

export class CaseTable extends React.Component<ICaseTableProps, ICaseTableState> {

  gridApi: GridApi;
  gridColumnApi: ColumnApi;

  gridColumnDefs: ColDef[];
  gridRowData: (ICase | undefined)[];

  // we don't need to refresh for changes the table already knows about
  isGridAwareChange: boolean;

  constructor(props: ICaseTableProps) {
    super(props);

    const { dataSet } = this.props;
    this.attachDataSet(dataSet);

    this.state = {
      rowSelection: 'multiple',
      rowModelType: 'inMemory',
    };

    this.isGridAwareChange = false;

    this.updateGridState(dataSet);
  }

  onGridReady = (gridReadyParams: GridReadyEvent) => {
    this.gridApi = gridReadyParams.api;
    this.gridColumnApi = gridReadyParams.columnApi;
  }

  getRowNodeId = (data: { id: string }) => data.id;

  getCaseIndexColumnDef(dataSet: IDataSet): ColDef {
    return ({
      headerName: '',
      // tslint:disable-next-line:no-any
      headerComponentFramework: TableHeaderMenu as (new () => any),
      headerComponentParams: {
        onNewAttribute: (name: string) => {
          addAttributeToDataSet(dataSet, { name });
        },
        onNewCase: () => {
          addCasesToDataSet(dataSet, [{}]);
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

  getAttributeColumnDef(dataSet: IDataSet, attribute: IAttribute): ColDef {
    return ({
      headerName: attribute.name,
      field: attribute.name,
      tooltipField: attribute.name,
      colId: attribute.id,
      editable: true,
      width: widths[attribute.name] || defaultWidth,
      valueGetter: (params: ValueGetterParams) => {
        const caseID = params.node.id,
              attrID = params.colDef.colId;
        return attrID ? dataSet.getValue(caseID, attrID) : undefined;
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
        if (params.newValue === params.oldValue) { return false; }
        const str = params.newValue && (typeof params.newValue === 'string')
                      ? params.newValue.trim() : undefined,
              num = str ? Number(str) : undefined,
              attrName = params.colDef.field || attribute.name,
              caseID = dataSet.cases[params.node.rowIndex].__id__,
              caseValues = {
                __id__: caseID,
                [attrName]: (num != null) && isFinite(num) ? num : str
              };
        if (caseValues[attrName] === params.oldValue) { return false; }
        this.isGridAwareChange = true;
        dataSet.setCaseValues([caseValues]);
        this.isGridAwareChange = false;
        return true;
      }
    });
  }

  getColumnDefs(dataSet: IDataSet) {
    let cols: ColDef[];
    cols = dataSet.attributes.map((attr) =>
      this.getAttributeColumnDef(dataSet, attr)
    );
    cols.unshift(this.getCaseIndexColumnDef(dataSet));
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
      this.gridApi.setRowData(this.gridRowData);
    }
  }

  attachDataSet(dataSet?: IDataSet) {
    if (dataSet) {
      dataSet.addActionListener('case-table', (action) => {
        if (!this.isGridAwareChange) {
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
          rowModelType={this.state.rowModelType}
          rowData={this.gridRowData}
          deltaRowDataMode={false}
          onGridReady={this.onGridReady}
        />
      </div>
    );
  }
}
