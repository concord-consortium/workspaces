import * as React from 'react';
import { Button, Dialog } from '@blueprintjs/core';
import '@blueprintjs/core/dist/blueprint.css';
import { Strings } from "../../../shared/strings";

interface INewAttributeDialogProps {
  isOpen: boolean;
  onNewAttribute: (name: string) => void;
  onClose: () => void;
  strings: Strings
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

  handleKeyDown = (evt: React.KeyboardEvent<HTMLInputElement>) => {
    if (evt.keyCode === 13) {
      this.handleNewAttribute();
    }
  }

  render() {
    const {strings} = this.props
    const attribute = strings.translate("attribute")
    const capitalizedAttribute = strings.translate("attribute", {capitalize: true})
    return (
      <Dialog
        iconName="pt-icon-add-column-right"
        isOpen={this.props.isOpen}
        onClose={this.props.onClose}
        title={`New ${capitalizedAttribute}`}
        canOutsideClickClose={false}
      >
        <div className="nc-attribute-name-prompt">Enter a name for the new {attribute}:</div>
        <input
          className="nc-attribute-name-input pt-input"
          type="text"
          placeholder={`${capitalizedAttribute} name`}
          value={this.state.name}
          onChange={this.handleNameChange}
          onKeyDown={this.handleKeyDown}
          dir="auto"
          ref={input => input && input.focus()}
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
