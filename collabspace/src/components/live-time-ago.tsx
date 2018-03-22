import * as React from "react"

const timeago = require("timeago.js")
const timeagoInstance = timeago()

export interface LiveTimeAgoProps {
  timestamp: number|object
}

export interface LiveTimeAgoState {
  ago: string
}

export class LiveTimeAgoComponent extends React.Component<LiveTimeAgoProps, LiveTimeAgoState> {
  interval: number

  constructor (props:LiveTimeAgoProps) {
    super(props);
    this.state = {
      ago: timeagoInstance.format(this.props.timestamp)
    }
  }

  componentWillMount() {
    this.interval = window.setInterval(this.handleInterval, 1000)
  }

  componentWillUnmount() {
    window.clearInterval(this.interval)
  }

  handleInterval = () => {
    const ago = timeagoInstance.format(this.props.timestamp)
    if (ago !== this.state.ago) {
      this.setState({ago})
    }
  }

  render() {
    return this.state.ago
  }
}

