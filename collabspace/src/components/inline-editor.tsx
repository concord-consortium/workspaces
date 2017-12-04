import * as React from "react"

export interface InlineEditorComponentProps {
  text: string
  changeText: (newText: string) => void
  width?: number
}

export interface InlineEditorComponentState {
  editing: boolean
  text: string
  uneditedText: string
}

export class InlineEditorComponent extends React.Component<InlineEditorComponentProps, InlineEditorComponentState> {

  constructor (props:InlineEditorComponentProps) {
    super(props);
    this.state = {
      editing: false,
      text: this.props.text,
      uneditedText: this.props.text
    }
    this.handleDoubleClick = this.handleDoubleClick.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.handleBlur = this.handleBlur.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handleMouseDown = this.handleMouseDown.bind(this)
  }

  refs: {
    text: HTMLInputElement
  }

  componentWillUpdate(nextProps:InlineEditorComponentProps) {
    if (!this.state.editing && (this.state.text !== nextProps.text)) {
      this.setState({text: nextProps.text, uneditedText: nextProps.text})
    }
  }

  doneEditing(changeText:boolean) {
    const text = this.refs.text.value.replace(/^\s+|\s+$/g, "")
    if (changeText && (text.length > 0)) {
      this.props.changeText(this.refs.text.value)
      this.setState({editing: false})
    }
    else {
      this.setState({
        text: this.state.uneditedText,
        editing: false
      })
    }
  }

  handleDoubleClick() {
    this.setState({editing: true}, () => {
      const {text} = this.refs
      text.focus()
      text.selectionStart = text.selectionEnd = text.value.length
    })
  }

  handleChange() {
    this.setState({text: this.refs.text.value})
  }

  handleBlur() {
    this.doneEditing(true)
  }

  handleKeyUp(e:React.KeyboardEvent<HTMLInputElement>) {
    if ((e.keyCode === 9) || (e.keyCode === 13)) {
      this.doneEditing(true)
    }
    else if (e.keyCode === 27) {
      this.doneEditing(true)
    }
  }

  handleMouseDown(e:React.MouseEvent<HTMLInputElement>) {
    e.stopPropagation()
  }

  render() {
    const {text} = this.state
    const style = this.props.width ? {width: this.props.width} : {}

    if (!this.state.editing) {
      return <div className="static" onDoubleClick={this.handleDoubleClick} style={style}><span className="clickable editable">{text}</span></div>
    }

    return <input
              type='text'
              value={text}
              ref="text"
              onChange={this.handleChange}
              onBlur={this.handleBlur}
              onKeyUp={this.handleKeyUp}
              onMouseDown={this.handleMouseDown}
              style={style}
            />
  }
}
