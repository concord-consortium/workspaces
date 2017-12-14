import * as React from 'react';
import { ICase, IDataSet } from '../data-manager/data-manager';
import { AgGridReact } from 'ag-grid-react';
import { GridReadyEvent, GridApi, ColDef, ColumnApi } from 'ag-grid';
import { ValueGetterParams, ValueFormatterParams, ValueSetterParams } from 'ag-grid/dist/lib/entities/colDef';
import 'ag-grid/dist/styles/ag-grid.css';
import 'ag-grid/dist/styles/ag-theme-fresh.css';
import './case-table.css';
// import { ICellRendererParams } from 'ag-grid';

interface ICaseTableProps {
  dataSet?: IDataSet;
}

interface ICaseTableState {
  rowSelection: string;
  rowModelType: string;
}

function getColumnDefs(dataSet: IDataSet): ColDef[] {
  let cols: ColDef[];
  cols = dataSet.attributes.map((attr) => {
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
          return {
            key: attr.name,
            headerName: attr.name,
            field: attr.name,
            tooltipField: attr.name,
            colId: attr.id,
            editable: true,
            width: widths[attr.name] || defaultWidth,
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
                    attrName = params.colDef.field || attr.name,
                    caseID = dataSet.cases[params.node.rowIndex].__id__,
                    caseValues = {
                      __id__: caseID,
                      [attrName]: (num != null) && isFinite(num) ? num : str
                    };
              if (caseValues[attrName] === params.oldValue) { return false; }
              dataSet.setCaseValues([caseValues]);
              return true;
            }
          };
        });
  cols.unshift({
    headerName: '#',
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
  return cols;
}

function getRowData(dataSet: IDataSet) {
  const rows = [];
  for (let i = 0; i < dataSet.cases.length; ++i) {
    // just need the ID; everything else comes from valueGetter
    rows.push({ id: dataSet.cases[i].__id__ });
  }
  return rows;
}

export class CaseTable extends React.Component<ICaseTableProps, ICaseTableState> {

  gridApi: GridApi;
  gridColumnApi: ColumnApi;

  gridColumnDefs: ColDef[];
  gridRowData: (ICase | undefined)[];

  constructor(props: ICaseTableProps) {
    super(props);

    const { dataSet } = this.props;

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

  updateGridState(dataSet?: IDataSet) {
    this.gridColumnDefs = dataSet ? getColumnDefs(dataSet) : [];
    this.gridRowData = dataSet ? getRowData(dataSet) : [];
    if (this.gridApi) {
      this.gridApi.setRowData(this.gridRowData);
    }
  }

  componentWillReceiveProps(nextProps: ICaseTableProps) {
    const { dataSet } = nextProps;
    if (dataSet !== this.props.dataSet) {
      if (this.props.dataSet) {
        this.props.dataSet.removeActionListener('case-table');
      }
      if (dataSet) {
        dataSet.addActionListener('case-table', (action) => {
          this.updateGridState(dataSet);
          this.forceUpdate();
        });
      }
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
