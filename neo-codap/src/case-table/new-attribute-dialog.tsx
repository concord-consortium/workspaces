import * as React from 'react';
import { Button, Dialog } from '@blueprintjs/core';
import '@blueprintjs/core/dist/blueprint.css';

interface INewAttributeDialogProps {
  isOpen: boolean;
  onNewAttribute: (name: string) => void;
  onClose: () => void;
}

interface INewAttributeDialogState {
  name: string;
}

export default
class NewAttributeDialog extends React.Component<INewAttributeDialogProps, INewAttributeDialogState> {

  constructor(props: INewAttributeDialogProps) {
    super(props);

    this.state = {
      name: ''
    };
  }

  handleNameChange = (evt: React.FormEvent<HTMLInputElement>) => {
    this.setState({ name: (evt.target as HTMLInputElement).value });
  }

  handleNewAttribute = () => {
    if (this.props.onNewAttribute) {
      this.props.onNewAttribute(this.state.name);
    }
  }

  render() {
    return (
      <Dialog
        iconName="pt-icon-add-column-right"
        isOpen={this.props.isOpen}
        onClose={this.props.onClose}
        title="New Attribute"
        canOutsideClickClose={false}
      >
        <div className="nc-attribute-name-prompt">Enter a name for the new attribute:</div>
        <input
          className="nc-attribute-name-input pt-input"
          type="text"
          placeholder="Attribute name"
          value={this.state.name}
          onChange={this.handleNameChange}
          dir="auto"
        />
        <div className="nc-dialog-buttons">
          <Button
            className="nc-dialog-button pt-intent-primary"
            text="OK"
            onClick={this.handleNewAttribute}
            disabled={!this.state.name}
          />
          <Button className="nc-dialog-button" text="Cancel"  onClick={this.props.onClose}/>
        </div>
      </Dialog>
    );
  }
}
