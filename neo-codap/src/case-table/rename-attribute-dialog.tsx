import * as React from 'react';
import { Button, Dialog } from '@blueprintjs/core';
import '@blueprintjs/core/dist/blueprint.css';
import { Strings } from '../strings';

interface IRenameAttributeDialogProps {
  id: string;
  isOpen: boolean;
  onRenameAttribute: (id: string, name: string) => void;
  onClose: () => void;
  strings: Strings;
  name: string
}

interface IRenameAttributeDialogState {
  name: string;
}

export default
class RenameAttributeDialog extends React.Component<IRenameAttributeDialogProps, IRenameAttributeDialogState> {

  constructor(props: IRenameAttributeDialogProps) {
    super(props);

    this.state = {
      name: this.props.name || ""
    };
  }

  componentWillReceiveProps(nextProps: IRenameAttributeDialogProps) {
    this.setState({name: nextProps.name})
  }

  handleNameChange = (evt: React.FormEvent<HTMLInputElement>) => {
    this.setState({ name: (evt.target as HTMLInputElement).value });
  }

  handleRenameAttribute = () => {
    if (this.props.onRenameAttribute) {
      this.props.onRenameAttribute(this.props.id, this.state.name);
    }
  }

  handleKeyDown = (evt: React.KeyboardEvent<HTMLInputElement>) => {
    if (evt.keyCode === 13) {
      this.handleRenameAttribute();
    }
  }

  render() {
    const {strings} = this.props;
    const attribute = strings.translate('attribute');
    const capitalizedAttribute = strings.translate('attribute', {capitalize: true});
    return (
      <Dialog
        iconName="pt-icon-add-column-right"
        isOpen={this.props.isOpen}
        onClose={this.props.onClose}
        title={`Rename ${capitalizedAttribute}`}
        canOutsideClickClose={false}
      >
        <div className="nc-attribute-name-prompt">Enter a new name for new {attribute}:</div>
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
            onClick={this.handleRenameAttribute}
            disabled={!this.state.name}
          />
          <Button className="nc-dialog-button" text="Cancel"  onClick={this.props.onClose}/>
        </div>
      </Dialog>
    );
  }
}
