import * as React from 'react';
import { emitCaseTableEvent } from './case-table-events';

export interface ICaseTableHeaderProps {
  reactContainer: any
  column: any
  displayName: string
  progressSort(multiSort: boolean): void;
}

export interface ICaseTableHeaderState {
  sort: string|null
}

export class CaseTableHeader extends React.Component<ICaseTableHeaderProps, ICaseTableHeaderState> {
  constructor(props: ICaseTableHeaderProps) {
    super(props);

    props.reactContainer.style.display = "inline-block";
    props.column.addEventListener('sortChanged', this.handleSortChanged);

    this.state = {
      sort: null
    };
  }

  handleClickTimeOut = 0
  lastClick = 0

  handleClick = (e:React.MouseEvent<HTMLDivElement>) => {
    const multiSort = e.shiftKey
    const now = Date.now()
    clearTimeout(this.handleClickTimeOut)

    if (now - this.lastClick < 250) {
      emitCaseTableEvent({
        type: "rename-attribute",
        id: this.props.column.colId,
        name: this.props.column.colDef.headerName
      })
    }
    else {
      this.handleClickTimeOut = window.setTimeout(() => {
        this.props.progressSort(multiSort);
      }, 250)
    }
    this.lastClick = now
  }

  handleSortChanged = () => {
    let sort:string|null = null
    const {column} = this.props
    if (column.isSortAscending()) {
      sort = "asc"
    }
    else if (column.isSortDescending()) {
      sort = "desc"
    }
    this.setState({sort})
  }

  handleDragStart = (e:React.DragEvent<HTMLDivElement>) => {
    const data = {
      type: 'drag-column-from-case-table',
      name: this.props.column.colDef.headerName
    };
    e.dataTransfer.setData('text', JSON.stringify(data));
  }

  renderSort() {
    const {sort} = this.state
    return sort ? <i className={`ag-icon ag-icon-${sort}`}></i> : null
  }

  render() {
    return (
      <div>
        <div className="customHeaderLabel" onClick={this.handleClick} draggable={true} onDragStart={this.handleDragStart}>
          {this.props.displayName}
          {this.renderSort()}
        </div>
      </div>
    );
  }

}