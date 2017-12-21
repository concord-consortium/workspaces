import * as React from 'react';
import NewAttributeDialog from './new-attribute-dialog';
import { Icon, Menu, Popover, Position, MenuDivider, MenuItem } from '@blueprintjs/core';
import '@blueprintjs/core/dist/blueprint.css';

interface ITableHeaderMenuProps {
  onNewAttribute: (name: string) => void;
  onNewCase: () => void;
  onSampleData?: (name: string) => void;
}

interface ITableHeaderMenuState {
  isNewAttributeDialogOpen: boolean;
}

export default
class TableHeaderMenu extends React.Component<ITableHeaderMenuProps, ITableHeaderMenuState> {

  constructor(props: ITableHeaderMenuProps) {
    super(props);

    this.state = {
      isNewAttributeDialogOpen: false
    };
  }

  openNewAttributeDialog = () => {
    this.setState({ isNewAttributeDialogOpen: true });
  }

  closeNewAttributeDialog = () => {
    this.setState({ isNewAttributeDialogOpen: false });
  }

  handleNewCase = () => {
    if (this.props.onNewCase) {
      this.props.onNewCase();
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
    return (
      <Menu>
        <MenuItem
          iconName="pt-icon-add-column-right"
          text="New Attribute"
          onClick={this.openNewAttributeDialog}
        />
        <MenuItem
          iconName="pt-icon-add-row-bottom"
          text="New Case"
          onClick={this.handleNewCase}
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
        />
      </div>
    );
  }
}
