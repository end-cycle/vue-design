interface Options {
    immediate?: boolean
    lazy?: boolean
    flush?: string
    scheduler?: (effectFn: EffectFn) => void
    // 其他可能的字段...
}

type EffectFn = (() => Object | number | string | boolean) & { options?: Options, deps: Set<EffectFn>[] }

// 用一个全局变量存储当前激活的 effect 函数
let activeEffect: EffectFn
// effect 栈
const effectStack: EffectFn[] = []

// ArrayInstrumentations数组拦截器
interface ArrayInstrumentations {
    includes: (searchElement: any, fromIndex?: number) => boolean
    indexOf: (searchElement: any, fromIndex?: number) => number
    lastIndexOf: (searchElement: any, fromIndex?: number) => number
    [propName: string]: (searchElement: any, fromIndex?: number) => number | boolean
}

interface target {
    [key: string]: any
    [key: symbol]: any
}

const ITERATE_KEY = Symbol()
const MAP_KEY_ITERATE_KEY = Symbol()

// 操作类型
enum TriggerKey {
    SET = 'SET',
    ADD = 'ADD',
    DELETE = 'DELETE',
}

function effect(fn: Function, options?: Options) {
    const effectFn: EffectFn = () => {
        cleanup(effectFn)
        // 当调用 effect 注册副作用函数时，将副作用函数赋值给 activeEffect
        activeEffect = effectFn
        // 在调用副作用函数之前将当前副作用函数压栈
        effectStack.push(effectFn)
        // 将 fn 的执行结果存储到 res 中
        const res = fn()
        // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEff2ect 还原为之前的值
        effectStack.pop()
        activeEffect = effectStack[effectStack.length - 1]
        return res
    }
    // 将 options 挂载到 effectFn 上
    effectFn.options = options
    // activeEffect.deps 用来存储所有与该副作用函数相关的依赖集合
    effectFn.deps = []
    // 只有非lazy的时候，才执行
    if (!options?.lazy) {
        // 执行副作用函数
        effectFn()
    }
    return effectFn
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

// 在 set 拦截函数内调用 trigger 函数触发变化
function trigger(target: Object, key: string | symbol, type?: TriggerKey, newVal?: any): void {
    console.log(`触发了trigger,target=${ target },key=${ key.toString() },type=${ type },newVal=${ newVal }`)
    const depsMap = bucket.get(target)
    if (!depsMap) return
    const effects = depsMap.get(key)
    const effectsToRun: Set<EffectFn> = new Set()
    effects && effects.forEach((effectFn: EffectFn) => {
        if (effectFn !== activeEffect)
            effectsToRun.add(effectFn)
    })
    if (type === TriggerKey.ADD && Array.isArray(target)) {
        // 取出与length相关联的副作用函数
        const lengthEffects: EffectFn[] = depsMap.get('length')
        // 将这些副作用函数添加到effectsToRun中，待执行
        lengthEffects && lengthEffects.forEach((effectFn) => {
            if (effectFn !== activeEffect)
                effectsToRun.add(effectFn)
        })
    }
    // 当操作类型为 ADD 或 DELETE 时，需要触发与 ITERATE_KEY 相关联的副作用函数重新执行
    if (type === TriggerKey.ADD || type === TriggerKey.DELETE || (type === TriggerKey.SET && Object.prototype.toString.call(target) === '[object Map]')) {
        // 则取出那些与 MAP_KEY_ITERATE_KEY 相关联的副作用函数并执行
        const iterateEffects = depsMap.get(ITERATE_KEY)
        iterateEffects && iterateEffects.forEach((effectFn: EffectFn) => {
            if (effectFn !== activeEffect)
                effectsToRun.add(effectFn)
        })
    }
    if ((type === TriggerKey.ADD || type === TriggerKey.DELETE) && Object.prototype.toString.call(target) === '[object Map]') {
        // 则取出那些与 MAP_KEY_ITERATE_KEY 相关联的副作用函数并执行
        const iterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY)
        iterateEffects && iterateEffects.forEach((effectFn: EffectFn) => {
            if (effectFn !== activeEffect)
                effectsToRun.add(effectFn)
        })
    }
    if (Array.isArray(target) && key === 'length') {
        // 对于索引大于或等于新的 length 值的元素，需要把所有相关联的副作用函数取出并添加到 effectsToRun 中待执行
        depsMap.forEach((effects: EffectFn[], key: any) => {
            if (key >= newVal) {
                effects.forEach((effectFn: EffectFn) => {
                    if (effectFn !== activeEffect)
                        effectsToRun.add(effectFn)
                })
            }
        })
    }
    effectsToRun.forEach((effectFn) => {
        // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
        if (effectFn?.options?.scheduler) {
            effectFn.options.scheduler(effectFn)
        }
        else {
            // 否则直接执行副作用函数（之前的默认行为）
            effectFn()
        }
    })
}

const bucket = new WeakMap()
function track(target: Object, key: string | symbol) {
    console.log(`触发了track追踪，target=${ target },key=${ String(key) }`);
    // 没有 activeEffect且数组方法还没执行完shouldTrack为false时，直接 return
    if (!activeEffect || !shouldTrack)
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
    activeEffect.deps.push(deps)
}

// computed实现
function computed(getter: Function) {
    // value 用来缓存上一次计算的值
    let value: any
    // dirty 标志，用来标识是否需要重新计算值
    let dirty = true
    // 把 getter 作为副作用函数，创建一个 lazy 的 effect
    const effectFn = effect(getter, {
        lazy: true,
        scheduler() {
            if (!dirty) {
                dirty = true
                // 当计算属性依赖的响应式数据变化时，手动调用 trigger 函数触发响应
                trigger(obj, 'value')
            }
        },
    })

    const obj = { // 当读取 value 时才执行 effectFn
        get value() {
            if (dirty) {
                value = effectFn()
                dirty = false
            }
            track(obj, 'value')
            return value
        },
    }

    return obj
}

function traverse(value: any, seen = new Set()) {
    // 如果要读取的数据是原始值，或者已经被读取过了，那么什么都不做
    if (typeof value !== 'object' || value === null || seen.has(value))
        return
    // 将数据添加到 seen 中，代表遍历地读取过了，避免循环引用引起的死循环
    seen.add(value)
    // 暂时不考虑数组等其他结构
    // 假设 value 就是一个对象，使用 for...in 读取对象的每一个值，并递归地调用 traverse 进行处理
    for (const k in value)
        traverse(value[k], seen)

    return value
}

// watch实现
function watch(source: any, cb: Function, options: Options) {
    let getter: Function
    if (typeof source === 'function')
        getter = source
    else
        getter = () => traverse(source)

    let oldValue: any, newValue: any

    // cleanup 用来存储用户注册的过期回调
    let cleanup: Function
    // 定义 onInvalidate 函数
    function onInvalidate(fn: Function) {
        // 将过期回调存储到 cleanup 中
        cleanup = fn
    }

    const job = () => {
        newValue = effectFn()
        // 在调用回调函数 cb 之前，先调用过期回调
        if (cleanup)
            cleanup()

        // 将 onInvalidate 作为回调函数的第三个参数，以便用户使用
        cb(newValue, oldValue, onInvalidate)
        oldValue = newValue
    }

    const effectFn = effect(
        // 执行 getter
        () => getter(),
        {
            lazy: true,
            scheduler: () => {
                if (options.flush === 'post') {
                    const p = Promise.resolve()
                    p.then(job)
                }
                else {
                    job()
                }
            },
        },
    )

    if (options.immediate)
        job()
    else
        oldValue = effectFn()
}

// const originMethod = Array.prototype.includes;
// const arrayInstrumentations = {
//     includes: function (searchElement: any, fromIndex?: number): any {
//         let res = originMethod.apply(this, [searchElement, fromIndex]);
//         if (res === false) {
//             res = originMethod.apply(Reflect.get(this, "raw"), [searchElement, fromIndex]);
//         }
//         return res;
//     }
// };

const arrayInstrumentations: ArrayInstrumentations = {} as ArrayInstrumentations;
['includes', 'indexOf', 'lastIndexOf'].forEach((method: string) => {
    const originMethod: (...args: any[]) => number | boolean = (Array.prototype as any)[method]
    arrayInstrumentations[method] = function (...args: any[]) {
        // this 是代理对象，先在代理对象中查找，将结果存储到 res 中
        let res = originMethod.apply(this, args)

        if (res === false || res === -1) {
            // res 为 false 说明没找到，通过 this.raw 拿到原始数组，再去其中查找，并更新 res 值
            res = originMethod.apply(Reflect.get(this, 'raw'), args)
        }
        // 返回最终结果
        return res
    }
})

// 一个标记变量，代表是否进行追踪。默认值为 true，即允许追踪
let shouldTrack = true;
// 重写数组的 push、pop、shift、unshift 以及 splice 方法
['push', 'pop', 'shift', 'unshift', 'splice'].forEach((method: string) => {
    // 取得原始 push 方法
    const originMethod = (Array.prototype as any)[method]
    // 重写
    arrayInstrumentations[method] = function (...args) {
        // 在调用原始方法之前，禁止追踪
        shouldTrack = false
        // push 方法的默认行为
        const res = originMethod.apply(this, args)
        // 在调用原始方法之后，恢复原来的行为，即允许追踪
        shouldTrack = true
        return res
    }
})
interface MutableInstrumentations {
    [key: string]: any;
    [key: symbol]: any;
}
function createIteratorMethod(iterateFn: (target: any) => IterableIterator<any>, trackKey: symbol) {
    return function (this: { raw: any }) {
        const target = this.raw
        const itr = iterateFn(target)

        const wrap = (val: any) => typeof val === 'object' ? reactive(val) : val

        track(target, trackKey)

        return {
            next() {
                const { value, done } = itr.next()
                return {
                    value: value ? wrap(value) : value,
                    done
                }
            },
            [Symbol.iterator]() {
                return this
            }
        }
    }
}

const iterationMethod = createIteratorMethod(function* (target: any) { yield* target }, ITERATE_KEY)
const keysIterationMethod = createIteratorMethod(function* (target: any) { yield* target.keys() }, MAP_KEY_ITERATE_KEY)
const valuesIterationMethod = createIteratorMethod(function* (target: any) { yield* target.values() }, ITERATE_KEY)

// 定义一个对象，将自定义的 add 方法定义到该对象下
const mutableInstrumentations: MutableInstrumentations = {
    add(key: string) {
        // this 仍然指向的是代理对象，通过 raw 属性获取原始数据对象
        const target = Reflect.get(this, 'raw')
        // 通过原始数据对象执行 add 方法添加具体的值，
        // 注意，这里不再需要 .bind 了，因为是直接通过 target 调用并执行的
        const hadKey = target.has(key)
        const res = target.add(key)
        console.log(`拦截到了set_add操作，target=${ JSON.stringify(target) },key=${ String(key) }`)
        if (!hadKey) {
            // 调用 trigger 函数触发响应，并指定操作类型为 ADD
            trigger(target, key, TriggerKey.ADD)
            // 返回操作结果
        }
        return res
    },
    delete(key: string) {
        const target = Reflect.get(this, 'raw')
        const hadKey = target.has(key)
        const res = target.delete(key)
        // 当要删除的元素确实存在时，才触发响应
        console.log(`拦截到了set_delete操作，target=${ JSON.stringify(target) },key=${ String(key) }`)
        if (hadKey) {
            trigger(target, key, TriggerKey.DELETE)
        }
        return res
    },
    get(key: string) {
        // 获取原始对象
        const target = Reflect.get(this, 'raw')
        // 判断读取的 key 是否存在
        const had = target.has(key)
        // 追踪依赖，建立响应联系
        console.log(`拦截到了map_get操作，target=${ JSON.stringify(target) },key=${ String(key) }`)
        track(target, key)
        if (had) {
            const res = target.get(key)
            return typeof res === 'object' ? reactive(res) : res
        }
    },
    set(key: string, value: any) {
        const target = Reflect.get(this, 'raw')
        const had = target.has(key)
        // 获取旧值
        const oldValue = target.get(key)
        // 获取原始数据，由于 value 本身可能已经是原始数据，所以此时 value.raw 不存在，则直接使用 value
        const rawValue = value.raw || value
        // 设置新值
        target.set(key, rawValue)
        // 如果不存在，则说明是 ADD 类型的操作，意味着新增
        console.log(`拦截到了map_set操作，target=${ JSON.stringify(target) },key=${ String(key) },oldValue=${ oldValue },newValue=${ value }`)
        if (!had) {
            trigger(target, key, TriggerKey.ADD)
        } else if (!Object.is(value, oldValue)) {
            // 如果不存在，并且值变了，则是 SET 类型的操作，意味着修改
            trigger(target, key, TriggerKey.SET, value)
        }
    },
    forEach(callback: Function, thisArg: any) {
        // 取得原始数据对象
        // wrap 函数用来把可代理的值转换为响应式数据
        const wrap = (val: any) => typeof val === 'object' ? reactive(val) : val
        const target = Reflect.get(this, 'raw')
        console.log(`拦截到了map_forEach操作，target=${ JSON.stringify(target) },key=${ String(ITERATE_KEY) }`)
        // 与 INERATE_KEY 建立响应联系
        track(target, ITERATE_KEY)
        // 通过原始数据对象调用 forEach 方法，并把 calback 传递过去
        target.forEach((value: any, key: any) => {
            // 通过 .call 调用 callback，并传递 thisArg，对key和value都要进行监测封装，
            //因为key和value变化都会有相应的effct
            callback.call(thisArg, wrap(value), wrap(key), this)
        })
    },
    [Symbol.iterator]: iterationMethod,
    entries: iterationMethod,
    keys: keysIterationMethod,
    values: valuesIterationMethod
}



// 代理对象工厂函数
function createReactive(obj: object, isShallow = false, isReadonly = false): object {
    return new Proxy(obj, {
        // 拦截读取操作，接收第三个参数 receiver
        get(target: target, key, receiver) {
            console.log(`拦截到了get操作，target=${ JSON.stringify(target) },key=${ String(key) }`, receiver)
            // 代理对象可以通过 raw 属性访问原始数据
            if (key === 'raw') {
                return target
            }
            if (key === 'size') {
                // 如果读取的是 size 属性
                // 通过指定第三个参数 receiver 为原始对象 target 从而修复问题
                track(target, ITERATE_KEY)
                return Reflect.get(target, key, target)
            }
            if (!isReadonly && typeof key !== 'symbol') {
                track(target, key)
            }
            if (key === Symbol.iterator) {
            }
            // 原先使用Object.keys，但是Object.keys不能输出symbol，所以使用Reflect.ownKeys来输出Symbol

            if (Reflect.ownKeys(mutableInstrumentations).includes(key as string)) {
                return mutableInstrumentations[key]
            }
            // 如果操作的目标对象是数组，并且 key 存在于 arrayInstrumentations 上，
            // 那么返回定义在arryInstrumentation 上的值。

            if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key))
                return Reflect.get(arrayInstrumentations, key, receiver)

            // 非只读和key不为symbol的时候才需要建立响应联系

            // 使用 Reflect.get 返回读取到的属性值
            const res = Reflect.get(target, key, receiver)
            if (isShallow)
                return res

            if (typeof res === 'object' && res !== null) {
                // 调用 reactive 将结果包装成响应式数据并返回,如果数据为只读，则调用 readonly 对值进行包装
                return isReadonly ? readonly(res) : reactive(res)
            }
            return res
        },
        // 拦截设置操作
        set(target: { [key: string | symbol]: any }, key, newVal, receiver) {
            if (isReadonly) {
                console.warn(`属性${ String(key) }是只读的`)
                return true
            }

            const oldVal = target[key]
            console.log(`拦截到了set操作，target=${ JSON.stringify(target) },key=${ String(key) },newVal=${ newVal },oldVal=${ oldVal }`)
            // 如果属性不存在，则说明是在添加新属性，否则是设置已有属性
            const type = Array.isArray(target) ? Number(key) < target.length ? TriggerKey.SET : TriggerKey.ADD : Object.prototype.hasOwnProperty.call(target, key) ? TriggerKey.SET : TriggerKey.ADD
            // 设置属性值
            const res = Reflect.set(target, key, newVal, receiver)

            // 新旧值不相等时且receiver是target的代理对象时才触发更新
            if (!Object.is(newVal, oldVal) && (target === receiver.raw)) {
                // 把副作用函数从桶里取出并执行
                trigger(target, key, type, newVal)
            }
            return res
        },
        // 拦截 in 操作
        has(target, key) {
            console.log(`拦截到了in操作，target=${ JSON.stringify(target) },key=${ String(key) }`)
            track(target, key)
            return Reflect.has(target, key)
        }, // 拦截 for...in 操作
        ownKeys(target) {
            // 使用ITERATE_KEY 代替 key，forin迭代操作针对对象，使用symbol作为唯一标识
            // 如果操作目标 target 是数组，则使用 length 属性作为 key 并建立响应联系
            console.log(`拦截到了for...in操作，target=${ JSON.stringify(target) },key=${ String(ITERATE_KEY) }`)
            track(target, Array.isArray(target) ? 'length' : ITERATE_KEY)
            return Reflect.ownKeys(target)
        },
        // 拦截 delete 操作
        deleteProperty(target, key) {
            console.log(`拦截到了delete操作，target=${ JSON.stringify(target) },key=${ String(ITERATE_KEY) }`)
            if (isReadonly) {
                console.warn(`属性${ String(key) }是只读的`)
                return true
            }
            const res = Reflect.deleteProperty(target, key)
            // 触发删除操作
            trigger(target, key, TriggerKey.DELETE)
            return res
        },
    })
}

// 定义一个 Map 实例，存储原始对象到代理对象的映射。
const reactiveMap = new Map()

// 深响应代理对象
function reactive<T extends object>(obj: T) {
    // 优先通过原始对象 obj 寻找之前创建的代理对象，如果找到了，直接返回已有的代理对象
    const existionProxy = reactiveMap.get(obj)
    if (existionProxy)
        return existionProxy

    // 否则，创建新的代理对象
    const proxy = createReactive(obj)
    // 存储到 Map 中，从而避免重复创建
    reactiveMap.set(obj, proxy)

    return proxy
}

// 浅响应代理对象
function shallowReactive<T extends object>(obj: T) {
    return createReactive(obj, true)
}

// 深只读响应代理对象
function readonly<T extends object>(obj: T) {
    return createReactive(obj, false, true)
}
// 浅只读响应代理对象
function shallowReadonly<T extends object>(obj: T) {
    return createReactive(obj, true, true)
}

// 5.8.1 如何代理 set和map
// 实现代理map
// const s = new Set([1, 2, 3])
// const p = reactive(s)
// console.log(s.size)
// p.delete(1)



// 5.8.2 建立响应建立
// const p = reactive(new Set([1, 2, 3]))

// effect(() => {
//     console.log(p.size)
// })
// p.add(1)
// 5.8.3 避免污染原始数据
// const p = reactive(new Map([['key', 1]]))
// effect(() => {
//     console.log('触发了get_effect', p.get('key'))
// })
// p.set('key', 2)

// // 原始 Map 对象 m
// const m = new Map()?
// // p1 是 m 的代理对象
// const p1 = reactive(m)
// // p2 是另外一个代理对象
// const p2 = reactive(new Map())
// // 为 p1 设置一个键值对，值是代理对象 p2
// p1.set('p2', p2)

// effect(() => {
//     // 注意，这里我们通过原始数据 m 访问 p2
//     console.log(m.get('p2').size)
// })
// //  通过原始数据 m  为 p2 设置一个键值对
// m.get('p2').set('foo', 1)

// 5.8.4 处理forEach
// const p = reactive(new Map([
//     [{ key: 1 }, { value: 1 }]
// ]))

// effect(() => {
//     p.forEach((value: any, key: any) => {
//         console.log(value) // { value: 1 }
//         console.log(key) // { key: 1 }
//     })
// })
// p.set({ key: 2 }, { value: 2 })

// const key = { key: 1 }
// const value = new Set([1, 2, 3])
// const p = reactive(new Map([
//     [key, value]
// ]))

// effect(() => p.forEach((value: any, key: any) => {
//     console.log(value.size)
// }))

// p.get(key).delete(1)
// const p = reactive(new Map([
//     ['key', 1]
// ]))

// effect(() => {
//     p.forEach(function (value: any, key: any) {
//         // forEach 循环不仅关心集合的键，还关心集合的值
//         console.log("触发了set_forEach", value) // 1
//     })
// })

// p.set('key', 2) // 即使操作类型是 SET，也应该触发响应


// 5.8.5 迭代器方法
// const p = reactive(new Map([
//     ['key1', 'value1'],
//     ['key2', 'value2'],
// ]))
// effect(() => {
//     for (const [key, value] of p) {
//         console.log(key, value)
//     }
// })
// p.set('key3', 'value3')


// 5.8.6 values 与 keys 方法
const p = reactive(new Map([
    ['key1', 'value1'],
    ['key2', 'value2'],
]))

effect(() => {
    for (const value of p.keys()) {
        console.log('触发了values拦截', value);
    }
})
p.set('key2', 'value3')
p.set('key3', 'value3')
// // 使用数组进行兼容测试
// const arr = reactive([])
// // 第一个副作用函数
// effect(() => {
// arr.push(1)
// })

// // 第二个副作用函数
// effect(() => {
// arr.push(1)
// })