import debug from 'debug'
import { AssetsBundleJSON, MessageOwner, PodStatus, WorkPort } from '@catalyze/basic'
import { defineReadAndWriteWxProperty, tick } from '@catalyze/basic'
import { MixinWxAssetsBundle, WxAsset, WxAssetAppJSON } from '@catalyze/wx-asset'
import { WxLibs } from './libs'
import { WxInit, WxSettings } from '../context'

import { FS } from '../capability/fs'
import { Network } from '../capability/network'
import { System } from '../capability/system'
import { Storage } from '../capability/storage'
import { User } from '../capability/user'
import { Controller } from '../capability/controller'
import { Request } from '../capability/request'
import { UI } from '../capability/ui'
import { WxCapabilityCreate } from '../capability'

import '../asset'

type ConnectionPayload = {
  type: string,
  port: MessagePort
}

type MessagePayload = {
  parameters: string[]
}

type InjectFile  = {
  filename: string,
  source: string
}

const worker_debug = debug('wx:app:worker')


export class WxApp extends MixinWxAssetsBundle(WxLibs) {
  static create (...rests: unknown[]) {
    const wx = super.create(...rests)

    wx.register(FS as WxCapabilityCreate, {})
    wx.register(Network)
    wx.register(System)
    wx.register(Storage)
    wx.register(User)
    wx.register(Controller)
    wx.register(Request)
    wx.register(UI)

    return wx
  }

  constructor () {
    super()

    this.command('message::init', async (message: MessageOwner) => {
      const payload = message.payload as unknown as MessagePayload
      const { settings, assets } = payload.parameters[0] as unknown as WxInit

      await this.fromAssetsBundleAndSettings(assets, settings)
    })

    this.once('inited', () => {
      defineReadAndWriteWxProperty(globalThis, 'window', globalThis)
      defineReadAndWriteWxProperty(globalThis, '__wxConfig', this.configs)
      defineReadAndWriteWxProperty(globalThis, 'WeixinJSCore', this)
      defineReadAndWriteWxProperty<string>(globalThis, 'decodePathName', '')
      defineReadAndWriteWxProperty<string>(globalThis, '__wxRoute', '')
      defineReadAndWriteWxProperty<boolean>(globalThis, '__wxRouteBegin', false)
      defineReadAndWriteWxProperty<string>(globalThis, '__wxAppCurrentFile__', '')
      defineReadAndWriteWxProperty<object>(globalThis, '__wxAppData', {})
      defineReadAndWriteWxProperty<object>(globalThis, '__wxAppCode__', {})
      
      tick(() => this.startup())
    })

    this.on('subscribe', (...rest: unknown[]) => {
      worker_debug('处理来自 View 层消息  <name: %s, data: %o, parameters: %o>', rest[0], rest[1], rest[2])
      globalThis.WeixinJSBridge.subscribeHandler(...rest)
    }) 
  }

  inject (name: string, code: string) {
    if (code !== null) {
      this.eval(code, `wx://app/${name}`)
    }
  }

  // 初始化
  fromAssetsBundleAndSettings (assets: AssetsBundleJSON, settings: WxSettings) {
    this.fromAssetsBundleJSON(assets)
    return this.mount().then(() => {
      const proj = (this.findByFilename('project.config.json') as WxAsset).data as WxAssetAppJSON 
      const app = (this.findByFilename('app.json') as WxAsset).data as WxAssetAppJSON
      const configs = {
        appLaunchInfo: {
          scene: settings.scene,
          path: settings.path
        },
        accountInfo: settings.account,
        pages: app.pages,
        env: settings.env,
        entryPagePath: settings.entry
      }
  
      this.configs = configs
      this.settings = settings
    })
  }
 
  // 启动逻辑层，注入代码
  async startup () {
    const sets = this.pages.concat(this.components)
    const files: InjectFile[] = [
      {
        source: (this.findByFilename(`@wx/wxml.js`) as WxAsset).data as string,
        filename: 'wxml.js'
      },
    ].concat(sets.map((set) => {
      return {
        filename: set.js.relative,
        source: set.js.data as string
      }
    }), sets.reduce((file, set) => {
      file.source += `
        decodePathName = decodeURI('${set.relative}');
        __wxAppCode__[decodePathName + '.json'] = {};
        __wxAppCode__[decodePathName + '.wxml'] = $gwx(decodePathName + '.wxml');
        __wxRoute = decodePathName;
        __wxRouteBegin = true;
        __wxAppCurrentFile__ = decodePathName + '.js';
        require(__wxAppCurrentFile__);
      `
      return file
    }, {
      filename: 'boot.js',
      source: ''
    }))

    for (const file of files) {
      this.inject(`wx://app/${file.filename}`, file.source)
    }
    
    this.status |= PodStatus.On
  }
}

// 监听 Connection 请求
self.addEventListener('message', async (event: MessageEvent<ConnectionPayload>) => {
  const payload = event.data

  if (payload.type === 'connection') {
    worker_debug('开始链接 Worker')
    const wx = WxApp.create(new WorkPort(payload.port)) as unknown as WxApp
    wx.emit('connected')
  }
  
  self.postMessage({ status: 'connected' })
})
