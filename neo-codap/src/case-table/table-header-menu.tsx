import * as React from 'react';
import NewAttributeDialog from './new-attribute-dialog';
import RenameAttributeDialog from './rename-attribute-dialog';
import { IDataSet } from '../data-manager/data-manager';
import { GridApi } from 'ag-grid';
import { Icon, Menu, Popover, Position, MenuDivider, MenuItem } from '@blueprintjs/core';
import { Strings } from '../strings';
import { listenForCaseTableEvents } from './case-table-events';

import '@blueprintjs/core/dist/blueprint.css';

interface ITableHeaderMenuProps {
  dataSet?: IDataSet;
  gridApi: GridApi;
  onNewAttribute: (name: string) => void;
  onRenameAttribute: (id: string, name: string) => void;
  onNewCase: () => void;
  onRemoveAttribute: (id: string) => void;
  onRemoveCases: (ids: string[]) => void;
  onSampleData?: (name: string) => void;
  strings: Strings;
}

interface ITableHeaderMenuState {
  isNewAttributeDialogOpen: boolean;
  isRenameAttributeDialogOpen: boolean;
  renameAttributeId: string;
  renameAttributeName: string;
}

export default
class TableHeaderMenu extends React.Component<ITableHeaderMenuProps, ITableHeaderMenuState> {

  constructor(props: ITableHeaderMenuProps) {
    super(props);

    this.state = {
      isNewAttributeDialogOpen: false,
      isRenameAttributeDialogOpen: false,
      renameAttributeId: "",
      renameAttributeName: ""
    };

    listenForCaseTableEvents((event) => {
      switch (event.type) {
        case "rename-attribute":
          this.setState({
            isRenameAttributeDialogOpen: true,
            renameAttributeId: event.id,
            renameAttributeName: event.name
          });
          break;
      }
    });
  }

  openNewAttributeDialog = () => {
    this.setState({ isNewAttributeDialogOpen: true });
  }

  closeNewAttributeDialog = () => {
    this.setState({ isNewAttributeDialogOpen: false });
  }

  closeRenameAttributeDialog = () => {
    this.setState({ isRenameAttributeDialogOpen: false });
  }

  handleRenameAttribute = (id: string, name: string) => {
    this.props.onRenameAttribute(id, name)
    this.closeRenameAttributeDialog()
  }

  handleNewCase = () => {
    if (this.props.onNewCase) {
      this.props.onNewCase();
    }
  }

  handleRemoveAttribute = (evt: React.MouseEvent<HTMLElement>) => {
    if (this.props.onRemoveAttribute) {
      const elt: HTMLElement = evt.target as HTMLElement,
            classes = elt.className,
            match = /data-id-([-\w]*)/.exec(classes),
            attrID = match && match[1];
      if (attrID) {
        this.props.onRemoveAttribute(attrID);
      }
    }
  }

  getSelectedRowNodes() {
    return this.props.gridApi && this.props.gridApi.getSelectedNodes();
  }

  getSelectedRowNodeCount() {
    const selectedNodes = this.getSelectedRowNodes();
    return selectedNodes ? selectedNodes.length : 0;
  }

  handleRemoveCases = (evt: React.MouseEvent<HTMLElement>) => {
    if (this.props.onRemoveCases) {
      const selectedRows = this.getSelectedRowNodes() || [];
      this.props.onRemoveCases(selectedRows.map(row => row.id));
    }
  }

  handleFourSealsData = () => {
    if (this.props.onSampleData) {
      this.props.onSampleData('fourSeals');
    }
  }

  handleMammalsData = () => {
    if (this.props.onSampleData) {
      this.props.onSampleData('mammals');
    }
  }

  renderAttributeSubMenuItems() {
    if (!this.props.dataSet || !this.props.dataSet.attributes.length) { return null; }
    return this.props.dataSet.attributes.map((attr) => {
      return (
        <MenuItem
          className={`data-id-${attr.id}`}
          text={attr.name}
          key={attr.id}
          onClick={this.handleRemoveAttribute}
        />
      );
    });
  }

  renderSamplesSubMenu() {
    if (!this.props.onSampleData) { return null; }
    return (
      <MenuItem iconName="pt-icon-th" text="Samples">
        <MenuItem text="Four Seals" onClick={this.handleFourSealsData} />
        <MenuItem text="Mammals" onClick={this.handleMammalsData} />
      </MenuItem>
    );
  }

  renderMenu() {
    const {strings} = this.props;
    const kase = strings.translate('case', {capitalize: true});
    const kases = strings.translate('case', {capitalize: true, count: this.getSelectedRowNodeCount()});
    const attribute = strings.translate('attribute', {capitalize: true});
    return (
      <Menu>
        <MenuItem
          iconName="pt-icon-add-column-right"
          text={`New ${attribute}...`}
          onClick={this.openNewAttributeDialog}
        />
        <MenuItem
          iconName="pt-icon-add-row-bottom"
          text={`New ${kase}...`}
          onClick={this.handleNewCase}
        />
        <MenuDivider />
        <MenuItem
          iconName="pt-icon-remove-column"
          text={`Remove ${attribute}...`}
          disabled={!this.props.dataSet || !this.props.dataSet.attributes.length}
        >
          {this.renderAttributeSubMenuItems()}
        </MenuItem>
        <MenuItem
          iconName="pt-icon-remove-row-bottom"
          text={`Remove ${kases}`}
          onClick={this.handleRemoveCases}
          disabled={!this.getSelectedRowNodeCount()}
        />
        {this.props.onSampleData ? <MenuDivider /> : null}
        {this.renderSamplesSubMenu()}
      </Menu>
    );
  }

  render() {
    return (
      <div>
        <Popover
          popoverClassName="nc-table-menu-popover"
          content={this.renderMenu()}
          position={Position.BOTTOM_LEFT}
        >
          <Icon iconName="pt-icon-menu" />
        </Popover>
        <NewAttributeDialog
          isOpen={this.state.isNewAttributeDialogOpen}
          onNewAttribute={this.props.onNewAttribute}
          onClose={this.closeNewAttributeDialog}
          strings={this.props.strings}
        />
        <RenameAttributeDialog
          id={this.state.renameAttributeId}
          isOpen={this.state.isRenameAttributeDialogOpen}
          onRenameAttribute={this.handleRenameAttribute}
          onClose={this.closeRenameAttributeDialog}
          strings={this.props.strings}
          name={this.state.renameAttributeName}
        />
      </div>
    );
  }
}
