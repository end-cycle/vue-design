interface Options {
  immediate?: boolean
  lazy?: boolean
  flush?: string
  scheduler?: (effectFn: EffectFn) => void
  // 其他可能的字段...
}

type EffectFn = (() => void) & { options?: Options, deps: Set<EffectFn>[] }

// 用一个全局变量存储当前激活的 effect 函数
let activeEffect: EffectFn
// effect 栈
const effectStack: EffectFn[] = [] // 新增

function effect(fn: Function) {
  const effectFn: EffectFn = () => {
    cleanup(effectFn)
    // 当调用 effect 注册副作用函数时，将副作用函数赋值给 activeEffect
    activeEffect = effectFn
    // 在调用副作用函数之前将当前副作用函数压入栈中
    effectStack.push(effectFn) // 新增
    fn()
    // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
    effectStack.pop() // 新增
    activeEffect = effectStack[effectStack.length - 1] // 新增
  }
  // activeEffect.deps 用来存储所有与该副作用函数相关的依赖集合
  effectFn.deps = []
  // 执行副作用函数
  effectFn()
}

function cleanup(effectFn: EffectFn) {
  // 遍历 effectFn.deps 数组
  for (let i = 0; i < effectFn.deps.length; i++) {
    // deps 是依赖集合
    const deps = effectFn.deps[i]
    // 将 effectFn 从依赖集合中移除
    deps.delete(effectFn)
  }
  // 最后需要重置 effectFn.deps 数组
  effectFn.deps.length = 0
}

const bucket = new WeakMap()
function track(target: Object, key: string | symbol) {
  // 没有 activeEffect，直接 return
  if (!activeEffect)
    return
  let depsMap = bucket.get(target)
  if (!depsMap)
    bucket.set(target, (depsMap = new Map()))

  let deps = depsMap.get(key)
  if (!deps)
    depsMap.set(key, (deps = new Set()))

  // 把当前激活的副作用函数添加到依赖集合 deps 中
  deps.add(activeEffect)
  // deps 就是一个与当前副作用函数存在联系的依赖集合
  // 将其添加到 activeEffect.deps 数组中
  activeEffect.deps.push(deps) // 新增
}

// 在 set 拦截函数内调用 trigger 函数触发变化
function trigger(target: Object, key: string | symbol) {
  const depsMap = bucket.get(target)
  if (!depsMap)
    return
  const effects = depsMap.get(key)

  const effectsToRun: Set<EffectFn> = new Set(effects)
  effectsToRun.forEach((effectFn: EffectFn) => effectFn())
}

// 原始数据
const data: { [key: string | symbol]: string | boolean } = { foo: true, bar: true }
// 代理对象
const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key) {
    // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
    track(target, key)
    // 返回属性值
    return target[key]
  },
  // 拦截设置操作
  set(target, key, newVal) {
    // 设置属性值
    target[key] = newVal
    // 把副作用函数从桶里取出并执行
    trigger(target, key)
    // 返回 true 表示设置成功
    return true
  },
})

// 全局变量
let temp1, temp2

// effectFn1 嵌套了 effectFn2
effect(() => {
  console.log('effectFn1 执行')

  effect(() => {
    console.log('effectFn2 执行')
    // 在 effectFn2 中读取 obj.bar 属性
    temp2 = obj.bar
  })
  // 在 effectFn1 中读取 obj.foo 属性
  temp1 = obj.foo
})
