import * as React from "react"

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
      ago: this.format(this.props.timestamp)
    }
  }

  componentWillMount() {
    this.interval = window.setInterval(this.handleInterval, 1000)
  }

  componentWillUnmount() {
    window.clearInterval(this.interval)
  }

  handleInterval = () => {
    const ago = this.format(this.props.timestamp)
    if (ago !== this.state.ago) {
      this.setState({ago})
    }
  }

  format(timestamp:number|object):string {
    if (typeof timestamp === "number") {
      const pluralize = (n:number, s:string) => n === 1 ? s : `${s}s`
      const now = Date.now()
      const seconds = Math.round((now - timestamp) / 1000)
      const minutes = Math.round(seconds/60)
      const hours = Math.round(minutes/60)
      const days = Math.round(hours/24)

      if (seconds < 60) {
        return "Just now"
      }
      if (minutes < 60) {
        return `${minutes} ${pluralize(minutes, "minute")} ago`
      }
      if (hours < 24) {
        return `${hours} ${pluralize(hours, "hour")} ago`
      }
      return `${days} ${pluralize(days, "day")} ago`
    }
    return ""
  }

  render() {
    return this.state.ago
  }
}

