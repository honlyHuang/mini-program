import { ApiJSON, BaseApi, MessageTransport } from '@catalyze/basic'
import { WxBundlesJSON } from '@catalyze/bundle'
import { WxApiTransport } from './transport'
import WxApiJSON from './wx-api.json'

export enum WxQRCodeState {
  Uncreated = `uncreated`,
  Created = `created`,
  Alive = `alive`,
  Cancelled = `cancelled`,
  Scanned = `scanned`,
  Timeout = `timeout`
}

export interface WxUser {
  nickname: string,
  avatarURL: string
}

export interface WxQRCode {
  base64: string
}

export interface WxAppTabBar {
  custom?: boolean,
  list: {
    pagePath: string,
    selectedIcon?: string,
    unselectedIcon?: string,
    text: string
  }[]
}

export interface WxAppWindow {
  backgroundTextStyle?: string,
  backgroundColor?: string,
  navigationStyle?: `custom` | `dart` | 'light'
}


export type WxApiEvent = `Auth.signIn` | `Auth.signOut` | `Auth.initialed` | `Auth.WxQRCodeStateChanged`

export interface WxAppJSON {
  pages: string[],
  tabBar: WxAppTabBar
}

export interface WxAppProjectJSON {
  appid: string
}

export interface WxProjJSON {
  name: string,
  appid: string,
  version: string,
}

export interface WxUserLogin {
  code: string,
  appname: string,
  appicon_url: string,
  state: string
}

export interface WxApiService<T extends string> extends BaseApi<WxApiEvent | T> {
  Auth: {
    commands: {
      getUser (): Promise<WxUser>
      getAuthenticateWxQRCode (): Promise<string>
    }

    events: {
      initialed (): Promise<void>
      WxQRCodeStateChanged (status: WxQRCodeState): Promise<void>,
      signIn (user: WxUser): Promise<void>
    }
  }, 
  Program: {
    commands: {
      getWxAppBundles (): Promise<WxBundlesJSON>
      compile (): Promise<string[]>
      invoke (name: string, data: unknown, id: number): Promise<unknown>
      login (): Promise<WxUserLogin>
      createRequestTask (data: unknown): Promise<unknown>
    },
    events: {
      publish (name: string, options: unknown, parameters: unknown[]): Promise<void>
    }
  }
}

export enum WxApiState {
  Created = 1,
  Connecting = 2,
  Connected = 4,
  Ready = 8,
  Disconnected = 16,
  Error = 32,
}

export type ReadyHandle = () => void

export class WxApiService<T extends string> extends BaseApi<WxApiEvent | T> {
  constructor (transport?: MessageTransport) {
    super(WxApiJSON as ApiJSON, transport ?? null)
  }
}

export abstract class WxApi extends WxApiService<'ready' | 'connected' | 'disconnected' | 'error'> {
  public state: WxApiState = WxApiState.Created

  connect (uri: unknown)
  connect (transport: WxApiTransport) {
    this.state |= WxApiState.Created

    transport.on('error', () => {
      this.state &= ~WxApiState.Connecting
      this.state = WxApiState.Error
      this.emit('error', this.state)
    }).on('open', () => {
      this.state &= ~WxApiState.Connecting
      this.state = WxApiState.Connected
      this.emit('connected', this.state)
    }).on('close', () => {
      this.state = WxApiState.Disconnected | WxApiState.Connected
      this.emit('disconnected', this.state)
    })

    this.transport = transport
  }

  disconnect () {
    this.transport?.close()
  }
}