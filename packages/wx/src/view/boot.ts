import debug from 'debug'
import invariant from 'ts-invariant'
import { 
  MessageOwner,
  PodStatus, 
  WorkPort, 
  defineReadAndWriteWxProperty, 
  tick 
} from '@catalyze/basic'
import { WxAsset } from '@catalyze/wx-asset'
import { ProxyView } from './proxy'
import { WxInit } from '../context'

const view_debug = debug('wx:view:iframe')

type ConnectionPayload = {
  type: string,
  port: MessagePort
}

type MessagePayload = {
  
}

export class WxView extends ProxyView {
  constructor () {
    super()

    this.command('message::init', (message: MessageOwner) => {
      const payload = message.payload as MessagePayload
      const { id, path, settings, configs } = payload[0] as WxInit

      this.id = id as number
      this.path = path as string
      this.configs = configs
      this.settings = settings
    })

    this.once('inited', async () => {
      invariant(this.settings !== null)
      
      defineReadAndWriteWxProperty(globalThis, 'WeixinJSCore', this)
      defineReadAndWriteWxProperty(globalThis, '__wxConfig', this.configs)
      defineReadAndWriteWxProperty(globalThis, '__proxy_window__', {
        screen: {
          width: this.settings.size.width,
          height: this.settings.size.height,
        }
      })
      defineReadAndWriteWxProperty(globalThis, '__webviewId__', this.id)

      tick(() => this.startup())
    })

    this.on('subscribe', (...rest: unknown[]) => {
      view_debug('处理来自 App 层消息 <name: %s, data: %o, ids: %o>', rest[0], rest[1], rest[2])
      globalThis.WeixinJSBridge.subscribeHandler(rest[0], rest[1])
    })
  }

  invokeHandler (name: string, data: string, id: number): void {
    view_debug('View 层调用 Native 方法 <name: %s, data: %s, callbackId: %s>', name, data, id) 
  }

  publishHandler (name: string, data: string, viewIds: string): void {
    view_debug('发布消息 <name: %s, data: %s, viewIds: %s>', name, data, viewIds)
    super.publishHandler(name, data, viewIds)
  }

  inject (name: string, code: string) {
    if (code !== null) {
      this.eval(code, `wx://view/${name}`)
    }
  }

  startup () {
    this.boot()
    this.inject('start.js', `CSSRegistry.inject();\nvar generateFunc = $gwx('${this.path}.wxml');\nif (generateFunc) {document.dispatchEvent(new CustomEvent('generateFuncReady', { detail: { generateFunc: generateFunc }}));} else { document.body.innerText = 'Page "${this.path}" Not Found.';throw new Error('Page "${this.path}" Not Found.')}`)

    this.send({
      command: 'message::ready',
      payload: { parameters: [] }
    })

    this.status |= PodStatus.On
  }

  boot () {
    this.inject('wxml.js', this.wxml)
    this.inject('wxss.js', `(function (window){${this.wxss}})(__proxy_window__)`)
    this.inject('view.js', (this.findByFilename('@wx/view.js') as unknown as WxAsset).data as string)
  }
}

const main = async (event: MessageEvent<ConnectionPayload>) => {
  const payload = event.data

  if (payload.type === 'connection') {
    const wx = await WxView.create(new WorkPort(payload.port)) as unknown as WxView
    wx.emit('connected')
  }
  
  window.parent.postMessage({ status: 'connected' })
}

window.addEventListener('message', main)