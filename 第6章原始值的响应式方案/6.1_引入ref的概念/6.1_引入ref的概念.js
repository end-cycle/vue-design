"use strict";
// 用一个全局变量存储当前激活的 effect 函数
let activeEffect;
// effect 栈
const effectStack = [];
const ITERATE_KEY = Symbol();
const MAP_KEY_ITERATE_KEY = Symbol();
// 操作类型
var TriggerKey;
(function (TriggerKey) {
    TriggerKey["SET"] = "SET";
    TriggerKey["ADD"] = "ADD";
    TriggerKey["DELETE"] = "DELETE";
})(TriggerKey || (TriggerKey = {}));
function effect(fn, options) {
    const effectFn = () => {
        cleanup(effectFn);
        // 当调用 effect 注册副作用函数时，将副作用函数赋值给 activeEffect
        activeEffect = effectFn;
        // 在调用副作用函数之前将当前副作用函数压栈
        effectStack.push(effectFn);
        // 将 fn 的执行结果存储到 res 中
        const res = fn();
        // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEff2ect 还原为之前的值
        effectStack.pop();
        activeEffect = effectStack[effectStack.length - 1];
        return res;
    };
    // 将 options 挂载到 effectFn 上
    effectFn.options = options;
    // activeEffect.deps 用来存储所有与该副作用函数相关的依赖集合
    effectFn.deps = [];
    // 只有非lazy的时候，才执行
    if (!(options === null || options === void 0 ? void 0 : options.lazy)) {
        // 执行副作用函数
        effectFn();
    }
    return effectFn;
}
function cleanup(effectFn) {
    // 遍历 effectFn.deps 数组
    for (let i = 0; i < effectFn.deps.length; i++) {
        // deps 是依赖集合
        const deps = effectFn.deps[i];
        // 将 effectFn 从依赖集合中移除
        deps.delete(effectFn);
    }
    // 最后需要重置 effectFn.deps 数组
    effectFn.deps.length = 0;
}
// 在 set 拦截函数内调用 trigger 函数触发变化
function trigger(target, key, type, newVal) {
    console.log(`触发了trigger,target=${target},key=${key.toString()},type=${type},newVal=${newVal}`);
    const depsMap = bucket.get(target);
    if (!depsMap)
        return;
    const effects = depsMap.get(key);
    const effectsToRun = new Set();
    effects && effects.forEach((effectFn) => {
        if (effectFn !== activeEffect)
            effectsToRun.add(effectFn);
    });
    if (type === TriggerKey.ADD && Array.isArray(target)) {
        // 取出与length相关联的副作用函数
        const lengthEffects = depsMap.get('length');
        // 将这些副作用函数添加到effectsToRun中，待执行
        lengthEffects && lengthEffects.forEach((effectFn) => {
            if (effectFn !== activeEffect)
                effectsToRun.add(effectFn);
        });
    }
    // 当操作类型为 ADD 或 DELETE 时，需要触发与 ITERATE_KEY 相关联的副作用函数重新执行
    if (type === TriggerKey.ADD || type === TriggerKey.DELETE || (type === TriggerKey.SET && Object.prototype.toString.call(target) === '[object Map]')) {
        // 则取出那些与 MAP_KEY_ITERATE_KEY 相关联的副作用函数并执行
        const iterateEffects = depsMap.get(ITERATE_KEY);
        iterateEffects && iterateEffects.forEach((effectFn) => {
            if (effectFn !== activeEffect)
                effectsToRun.add(effectFn);
        });
    }
    if ((type === TriggerKey.ADD || type === TriggerKey.DELETE) && Object.prototype.toString.call(target) === '[object Map]') {
        // 则取出那些与 MAP_KEY_ITERATE_KEY 相关联的副作用函数并执行
        const iterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY);
        iterateEffects && iterateEffects.forEach((effectFn) => {
            if (effectFn !== activeEffect)
                effectsToRun.add(effectFn);
        });
    }
    if (Array.isArray(target) && key === 'length') {
        // 对于索引大于或等于新的 length 值的元素，需要把所有相关联的副作用函数取出并添加到 effectsToRun 中待执行
        depsMap.forEach((effects, key) => {
            if (key >= newVal) {
                effects.forEach((effectFn) => {
                    if (effectFn !== activeEffect)
                        effectsToRun.add(effectFn);
                });
            }
        });
    }
    effectsToRun.forEach((effectFn) => {
        var _a;
        // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
        if ((_a = effectFn === null || effectFn === void 0 ? void 0 : effectFn.options) === null || _a === void 0 ? void 0 : _a.scheduler) {
            effectFn.options.scheduler(effectFn);
        }
        else {
            // 否则直接执行副作用函数（之前的默认行为）
            effectFn();
        }
    });
}
const bucket = new WeakMap();
function track(target, key) {
    console.log(`触发了track追踪，target=${target},key=${String(key)}`);
    // 没有 activeEffect且数组方法还没执行完shouldTrack为false时，直接 return
    if (!activeEffect || !shouldTrack)
        return;
    let depsMap = bucket.get(target);
    if (!depsMap)
        bucket.set(target, (depsMap = new Map()));
    let deps = depsMap.get(key);
    if (!deps)
        depsMap.set(key, (deps = new Set()));
    // 把当前激活的副作用函数添加到依赖集合 deps 中
    deps.add(activeEffect);
    // deps 就是一个与当前副作用函数存在联系的依赖集合
    // 将其添加到 activeEffect.deps 数组中
    activeEffect.deps.push(deps);
}
// computed实现
function computed(getter) {
    // value 用来缓存上一次计算的值
    let value;
    // dirty 标志，用来标识是否需要重新计算值
    let dirty = true;
    // 把 getter 作为副作用函数，创建一个 lazy 的 effect
    const effectFn = effect(getter, {
        lazy: true,
        scheduler() {
            if (!dirty) {
                dirty = true;
                // 当计算属性依赖的响应式数据变化时，手动调用 trigger 函数触发响应
                trigger(obj, 'value');
            }
        },
    });
    const obj = {
        get value() {
            if (dirty) {
                value = effectFn();
                dirty = false;
            }
            track(obj, 'value');
            return value;
        },
    };
    return obj;
}
function traverse(value, seen = new Set()) {
    // 如果要读取的数据是原始值，或者已经被读取过了，那么什么都不做
    if (typeof value !== 'object' || value === null || seen.has(value))
        return;
    // 将数据添加到 seen 中，代表遍历地读取过了，避免循环引用引起的死循环
    seen.add(value);
    // 暂时不考虑数组等其他结构
    // 假设 value 就是一个对象，使用 for...in 读取对象的每一个值，并递归地调用 traverse 进行处理
    for (const k in value)
        traverse(value[k], seen);
    return value;
}
// watch实现
function watch(source, cb, options) {
    let getter;
    if (typeof source === 'function')
        getter = source;
    else
        getter = () => traverse(source);
    let oldValue, newValue;
    // cleanup 用来存储用户注册的过期回调
    let cleanup;
    // 定义 onInvalidate 函数
    function onInvalidate(fn) {
        // 将过期回调存储到 cleanup 中
        cleanup = fn;
    }
    const job = () => {
        newValue = effectFn();
        // 在调用回调函数 cb 之前，先调用过期回调
        if (cleanup)
            cleanup();
        // 将 onInvalidate 作为回调函数的第三个参数，以便用户使用
        cb(newValue, oldValue, onInvalidate);
        oldValue = newValue;
    };
    const effectFn = effect(
    // 执行 getter
    () => getter(), {
        lazy: true,
        scheduler: () => {
            if (options.flush === 'post') {
                const p = Promise.resolve();
                p.then(job);
            }
            else {
                job();
            }
        },
    });
    if (options.immediate)
        job();
    else
        oldValue = effectFn();
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
const arrayInstrumentations = {};
['includes', 'indexOf', 'lastIndexOf'].forEach((method) => {
    const originMethod = Array.prototype[method];
    arrayInstrumentations[method] = function (...args) {
        // this 是代理对象，先在代理对象中查找，将结果存储到 res 中
        let res = originMethod.apply(this, args);
        if (res === false || res === -1) {
            // res 为 false 说明没找到，通过 this.raw 拿到原始数组，再去其中查找，并更新 res 值
            res = originMethod.apply(Reflect.get(this, 'raw'), args);
        }
        // 返回最终结果
        return res;
    };
});
// 一个标记变量，代表是否进行追踪。默认值为 true，即允许追踪
let shouldTrack = true;
// 重写数组的 push、pop、shift、unshift 以及 splice 方法
['push', 'pop', 'shift', 'unshift', 'splice'].forEach((method) => {
    // 取得原始 push 方法
    const originMethod = Array.prototype[method];
    // 重写
    arrayInstrumentations[method] = function (...args) {
        // 在调用原始方法之前，禁止追踪
        shouldTrack = false;
        // push 方法的默认行为
        const res = originMethod.apply(this, args);
        // 在调用原始方法之后，恢复原来的行为，即允许追踪
        shouldTrack = true;
        return res;
    };
});
function createIteratorMethod(iterateFn, trackKey) {
    return function () {
        const target = this.raw;
        const itr = iterateFn(target);
        const wrap = (val) => typeof val === 'object' ? reactive(val) : val;
        track(target, trackKey);
        return {
            next() {
                const { value, done } = itr.next();
                return {
                    value: value ? wrap(value) : value,
                    done
                };
            },
            [Symbol.iterator]() {
                return this;
            }
        };
    };
}
const iterationMethod = createIteratorMethod(function* (target) { yield* target; }, ITERATE_KEY);
const keysIterationMethod = createIteratorMethod(function* (target) { yield* target.keys(); }, MAP_KEY_ITERATE_KEY);
const valuesIterationMethod = createIteratorMethod(function* (target) { yield* target.values(); }, ITERATE_KEY);
// 定义一个对象，将自定义的 add 方法定义到该对象下
const mutableInstrumentations = {
    add(key) {
        // this 仍然指向的是代理对象，通过 raw 属性获取原始数据对象
        const target = Reflect.get(this, 'raw');
        // 通过原始数据对象执行 add 方法添加具体的值，
        // 注意，这里不再需要 .bind 了，因为是直接通过 target 调用并执行的
        const hadKey = target.has(key);
        const res = target.add(key);
        console.log(`拦截到了set_add操作，target=${JSON.stringify(target)},key=${String(key)}`);
        if (!hadKey) {
            // 调用 trigger 函数触发响应，并指定操作类型为 ADD
            trigger(target, key, TriggerKey.ADD);
            // 返回操作结果
        }
        return res;
    },
    delete(key) {
        const target = Reflect.get(this, 'raw');
        const hadKey = target.has(key);
        const res = target.delete(key);
        // 当要删除的元素确实存在时，才触发响应
        console.log(`拦截到了set_delete操作，target=${JSON.stringify(target)},key=${String(key)}`);
        if (hadKey) {
            trigger(target, key, TriggerKey.DELETE);
        }
        return res;
    },
    get(key) {
        // 获取原始对象
        const target = Reflect.get(this, 'raw');
        // 判断读取的 key 是否存在
        const had = target.has(key);
        // 追踪依赖，建立响应联系
        console.log(`拦截到了map_get操作，target=${JSON.stringify(target)},key=${String(key)}`);
        track(target, key);
        if (had) {
            const res = target.get(key);
            return typeof res === 'object' ? reactive(res) : res;
        }
    },
    set(key, value) {
        const target = Reflect.get(this, 'raw');
        const had = target.has(key);
        // 获取旧值
        const oldValue = target.get(key);
        // 获取原始数据，由于 value 本身可能已经是原始数据，所以此时 value.raw 不存在，则直接使用 value
        const rawValue = value.raw || value;
        // 设置新值
        target.set(key, rawValue);
        // 如果不存在，则说明是 ADD 类型的操作，意味着新增
        console.log(`拦截到了map_set操作，target=${JSON.stringify(target)},key=${String(key)},oldValue=${oldValue},newValue=${value}`);
        if (!had) {
            trigger(target, key, TriggerKey.ADD);
        }
        else if (!Object.is(value, oldValue)) {
            // 如果不存在，并且值变了，则是 SET 类型的操作，意味着修改
            trigger(target, key, TriggerKey.SET, value);
        }
    },
    forEach(callback, thisArg) {
        // 取得原始数据对象
        // wrap 函数用来把可代理的值转换为响应式数据
        const wrap = (val) => typeof val === 'object' ? reactive(val) : val;
        const target = Reflect.get(this, 'raw');
        console.log(`拦截到了map_forEach操作，target=${JSON.stringify(target)},key=${String(ITERATE_KEY)}`);
        // 与 INERATE_KEY 建立响应联系
        track(target, ITERATE_KEY);
        // 通过原始数据对象调用 forEach 方法，并把 calback 传递过去
        target.forEach((value, key) => {
            // 通过 .call 调用 callback，并传递 thisArg，对key和value都要进行监测封装，
            //因为key和value变化都会有相应的effct
            callback.call(thisArg, wrap(value), wrap(key), this);
        });
    },
    [Symbol.iterator]: iterationMethod,
    entries: iterationMethod,
    keys: keysIterationMethod,
    values: valuesIterationMethod
};
// 代理对象工厂函数
function createReactive(obj, isShallow = false, isReadonly = false) {
    return new Proxy(obj, {
        // 拦截读取操作，接收第三个参数 receiver
        get(target, key, receiver) {
            console.log(`拦截到了get操作，target=${JSON.stringify(target)},key=${String(key)}`, receiver);
            // 代理对象可以通过 raw 属性访问原始数据
            if (key === 'raw') {
                return target;
            }
            if (key === 'size') {
                // 如果读取的是 size 属性
                // 通过指定第三个参数 receiver 为原始对象 target 从而修复问题
                track(target, ITERATE_KEY);
                return Reflect.get(target, key, target);
            }
            if (!isReadonly && typeof key !== 'symbol') {
                track(target, key);
            }
            if (key === Symbol.iterator) {
            }
            // 原先使用Object.keys，但是Object.keys不能输出symbol，所以使用Reflect.ownKeys来输出Symbol
            if (Reflect.ownKeys(mutableInstrumentations).includes(key)) {
                return mutableInstrumentations[key];
            }
            // 如果操作的目标对象是数组，并且 key 存在于 arrayInstrumentations 上，
            // 那么返回定义在arryInstrumentation 上的值。
            if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key))
                return Reflect.get(arrayInstrumentations, key, receiver);
            // 非只读和key不为symbol的时候才需要建立响应联系
            // 使用 Reflect.get 返回读取到的属性值
            const res = Reflect.get(target, key, receiver);
            if (isShallow)
                return res;
            if (typeof res === 'object' && res !== null) {
                // 调用 reactive 将结果包装成响应式数据并返回,如果数据为只读，则调用 readonly 对值进行包装
                return isReadonly ? readonly(res) : reactive(res);
            }
            return res;
        },
        // 拦截设置操作
        set(target, key, newVal, receiver) {
            if (isReadonly) {
                console.warn(`属性${String(key)}是只读的`);
                return true;
            }
            const oldVal = target[key];
            console.log(`拦截到了set操作，target=${JSON.stringify(target)},key=${String(key)},newVal=${newVal},oldVal=${oldVal}`);
            // 如果属性不存在，则说明是在添加新属性，否则是设置已有属性
            const type = Array.isArray(target) ? Number(key) < target.length ? TriggerKey.SET : TriggerKey.ADD : Object.prototype.hasOwnProperty.call(target, key) ? TriggerKey.SET : TriggerKey.ADD;
            // 设置属性值
            const res = Reflect.set(target, key, newVal, receiver);
            // 新旧值不相等时且receiver是target的代理对象时才触发更新
            if (!Object.is(newVal, oldVal) && (target === receiver.raw)) {
                // 把副作用函数从桶里取出并执行
                trigger(target, key, type, newVal);
            }
            return res;
        },
        // 拦截 in 操作
        has(target, key) {
            console.log(`拦截到了in操作，target=${JSON.stringify(target)},key=${String(key)}`);
            track(target, key);
            return Reflect.has(target, key);
        }, // 拦截 for...in 操作
        ownKeys(target) {
            // 使用ITERATE_KEY 代替 key，forin迭代操作针对对象，使用symbol作为唯一标识
            // 如果操作目标 target 是数组，则使用 length 属性作为 key 并建立响应联系
            console.log(`拦截到了for...in操作，target=${JSON.stringify(target)},key=${String(ITERATE_KEY)}`);
            track(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
            return Reflect.ownKeys(target);
        },
        // 拦截 delete 操作
        deleteProperty(target, key) {
            console.log(`拦截到了delete操作，target=${JSON.stringify(target)},key=${String(ITERATE_KEY)}`);
            if (isReadonly) {
                console.warn(`属性${String(key)}是只读的`);
                return true;
            }
            const res = Reflect.deleteProperty(target, key);
            // 触发删除操作
            trigger(target, key, TriggerKey.DELETE);
            return res;
        },
    });
}
// 定义一个 Map 实例，存储原始对象到代理对象的映射。
const reactiveMap = new Map();
// 深响应代理对象
function reactive(obj) {
    // 优先通过原始对象 obj 寻找之前创建的代理对象，如果找到了，直接返回已有的代理对象
    const existionProxy = reactiveMap.get(obj);
    if (existionProxy)
        return existionProxy;
    // 否则，创建新的代理对象
    const proxy = createReactive(obj);
    // 存储到 Map 中，从而避免重复创建
    reactiveMap.set(obj, proxy);
    return proxy;
}
// 浅响应代理对象
function shallowReactive(obj) {
    return createReactive(obj, true);
}
// 深只读响应代理对象
function readonly(obj) {
    return createReactive(obj, false, true);
}
// 浅只读响应代理对象
function shallowReadonly(obj) {
    return createReactive(obj, true, true);
}
function ref(val) {
    // 在 ref 函数内部创建包裹对象
    const wrapper = {
        value: val
    };
    // 使用 Object.defineProperty 在 wrapper 对象定义一个不可枚举的属性 __v_isRef, 并且值为 true
    Object.defineProperty(wrapper, '__v_isRef', {
        value: true
    });
    return reactive(wrapper);
}
const refVal1 = ref(1);
const refVal2 = reactive({ value: 1 });
effect(() => {
    // 在副作用函数内通过 value 属性读取原始值
    console.log('触发了ref_effect函数', refVal1.value);
});
// 修改值能够触发副作用函数重新执行
refVal1.value = 2;
