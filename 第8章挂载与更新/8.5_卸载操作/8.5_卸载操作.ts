interface VNode {
    type: string;
    props?: { [key: string]: any }; // 属性对象可以包含任意键值对
    children?: string | VNode[];
    el?: HTMLElement;
}

interface Options {
    createElement(tagName: string): HTMLElement;
    insert(parent: HTMLElement, child: HTMLElement, index?: Node): void;
    setElementText(element: HTMLElement, text: string): void;
    patchProps(element: HTMLElement, key: string, prevValue: string | null, nextValue: string): void;
}
function shouldSetAsProps(el: HTMLElement, key: string, value: any) {
    // 特殊处理
    if (key === 'form' && el.tagName === 'INPUT') return false
    // 兜底
    return key in el
}
function umount(vnode: VNode) {
    const parent = vnode.el?.parentNode
    if (parent && vnode.el) {
        parent.removeChild(vnode.el)
    }
}
function createRenderer(options: Options) {
    // 通过 options 得到操作 DOM 的 API
    const {
        createElement,
        insert,
        setElementText,
        patchProps
    } = options
    function mountElement(vnode: VNode, container: HTMLElement) {
        // 调用 createElement 函数创建元素
        const el = vnode.el = createElement(vnode.type)
        if (typeof vnode.children === 'string') {
            // 调用 setElementText  设置元素的文本节点
            setElementText(el, vnode.children)
        } else if (Array.isArray(vnode.children)) {
            // 如果  children 是数组，则遍历每一个子节点，并调用 patch 函数挂载它们
            vnode.children.forEach(child => {
                patch(null, child, el)
            })
        }
        if (vnode.props) {
            // 遍历 vnode.props
            for (const key in vnode.props) {
                patchProps(el, key, null, vnode.props[key])
            }
        }
        // 调用 insert 函数将元素插入到容器内
        insert(el, container)
    }
    function patch(n1: any, n2: any, container: any) {
        if (!n1) {
            mountElement(n2, container)
        } else {
            // n1 存在则是 diff
        }
    }
    function render(vnode: VNode | null, container: HTMLElement | object | any) {
        if (vnode) {
            // 新 vnode 存在，将其与旧 vnode 一起传递给 patch 函数，进行打补丁
            patch(container._vnode, vnode, container);
        } else {
            if (container._vnode) {
                umount(container._vnode)
            }
        }
        // 把 vnode 存储到 container._vnode 下，即后续渲染中的旧 vnode
        container._vnode = vnode;
    }

    return {
        render
    };
}

const vnode = {
    type: 'p',
    props: {
        // 序列化后的结果
        class: 'foo bar baz'
    }
}

// 在创建 renderer 时传入配置项

const renderer = createRenderer({
    createElement(tag) {
        return document.createElement(tag)
    },
    setElementText(el, text) {
        el.textContent = text
    },
    insert(el, parent, anchor: Node) {
        parent.insertBefore(el, anchor)
    },
    // 将属性设置相关操作封装到 patchProps 函数中，并作为渲染器选项传递
    patchProps(el, key, prevValue, nextValue) {
        // 如果key为class直接设置className比用setAtribute更快
        if (key === 'class') {
            el.className = nextValue || ''
        }
        if (shouldSetAsProps(el, key, nextValue)) {
            const type = typeof (el as any)[key]
            if (type === 'boolean' && nextValue === '') {
                (el as any)[key] = true
            } else {
                (el as any)[key] = nextValue
            }
        } else {
            el.setAttribute(key, nextValue)
        }
    }
})


// 本章节代码ts注解不好搞，又是HTMLElement又是object，后面的章节再规范
const container = { type: 'root' }
// 初次挂载
renderer.render(vnode, document.querySelector('#app'))
// 新 vnode 为 null，意味着卸载之前渲染的内容
renderer.render(null, document.querySelector('#app'))