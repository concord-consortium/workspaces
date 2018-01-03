import * as React from 'react';
import { Button, Dialog, IconName } from '@blueprintjs/core';
import '@blueprintjs/core/dist/blueprint.css';
import './simple-dialog.css';

interface ISimpleDialogProps {
  iconName?: IconName;
  title: string;
  message: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ISimpleDialogState {
}

export default
class SimpleDialog extends React.Component<ISimpleDialogProps, ISimpleDialogState> {

  constructor(props: ISimpleDialogProps) {
    super(props);

    this.state = {};
  }

  render() {
    const iconName: IconName = this.props.iconName || 'pt-icon-info-sign';
    return (
      <Dialog
        iconName={iconName}
        isOpen={this.props.isOpen}
        onClose={this.props.onClose}
        title={this.props.title}
        canOutsideClickClose={false}
      >
        <div className="nc-simple-dialog-message">{this.props.message || ''}</div>
        <div className="nc-dialog-buttons">
          <Button
            className="nc-dialog-button pt-intent-primary"
            text="OK"
            onClick={this.props.onClose}
          />
        </div>
      </Dialog>
    );
  }
}
