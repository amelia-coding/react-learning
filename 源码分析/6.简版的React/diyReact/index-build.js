//编译指示(pragma)
//const foo = <div id="foo">Hello!</div>;
//var foo = createElement('div', {id:"foo"}, 'Hello!');

/** @jsx DiyReact.createElement */
//导入生成的基本API
const DiyReact = importFromBelow(); //业务代码

const randomLikes = () => Math.ceil(Math.random() * 100);

const stories = [{
  name: "React",
  url: "https://reactjs.org/",
  likes: randomLikes()
}, {
  name: "Node",
  url: "https://nodejs.org/en/",
  likes: randomLikes()
}, {
  name: "Webpack",
  url: "https://webpack.js.org/",
  likes: randomLikes()
}];

const ItemRender = props => {
  const {
    name,
    url
  } = props;
  return DiyReact.createElement("a", {
    href: url
  }, name);
};

class App extends DiyReact.Component {
  render() {
    return DiyReact.createElement("div", null, DiyReact.createElement("h1", null, "\uD83D\uDCDA\u524D\u7AEF\u6846\u67B6\u6280\u672F"), DiyReact.createElement("ul", null, this.props.stories.map(story => {
      return DiyReact.createElement(Story, {
        name: story.name,
        url: story.url
      });
    })));
  }

  componentWillMount() {
    console.log("execute componentWillMount");
  }

  componentDidMount() {
    console.log("execute componentDidMount");
  }

  componentWillUnmount() {
    console.log("execute componentWillUnmount");
  }

}

class Story extends DiyReact.Component {
  constructor(props) {
    super(props);
    this.state = {
      likes: Math.ceil(Math.random() * 100)
    };
  }

  like() {
    this.setState({
      likes: this.state.likes + 1
    });
  }

  render() {
    const {
      name,
      url
    } = this.props;
    const {
      likes
    } = this.state;
    const likesElement = DiyReact.createElement("span", null);
    const itemRenderProps = {
      name,
      url
    };
    return DiyReact.createElement("li", null, DiyReact.createElement("button", {
      onClick: e => this.like()
    }, likes, DiyReact.createElement("b", null, "\u2764\uFE0F")), DiyReact.createElement(ItemRender, itemRenderProps));
  } // shouldcomponentUpdate() {
  //   return true;
  // }


  componentWillUpdate() {
    console.log("execute componentWillUpdate");
  }

  componentDidUpdate() {
    console.log("execute componentDidUpdate");
  }

}

DiyReact.render(DiyReact.createElement(App, {
  stories: stories
}), document.getElementById("root"));
/* 🌼DIY React源代码🌼 */

function importFromBelow() {
  const TEXT_ELEMENT = "TEXT_ELEMENT";

  function updateDomProperties(dom, prevProps, nextProps) {
    const isEvent = name => name.startsWith("on");

    const isAttribute = name => !isEvent(name) && name != "children"; // Remove event listeners


    Object.keys(prevProps).filter(isEvent).forEach(name => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    }); // Remove attributes

    Object.keys(prevProps).filter(isAttribute).forEach(name => {
      dom[name] = null;
    }); // Set attributes

    Object.keys(nextProps).filter(isAttribute).forEach(name => {
      dom[name] = nextProps[name];
    }); // Add event listeners

    Object.keys(nextProps).filter(isEvent).forEach(name => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
  } //rootInstance用来缓存一帧虚拟dom


  let rootInstance = null; //dom diff的render过程

  function render(element, parentDom) {
    // prevInstance指向前一帧
    const prevInstance = rootInstance; // element参数指向新生成的虚拟dom树

    const nextInstance = reconcile(parentDom, prevInstance, element);
    rootInstance = nextInstance;
  } //React diff 


  function reconcile(parentDom, instance, element) {
    if (instance === null) {
      const newInstance = instantiate(element); // componentWillMount

      newInstance.publicInstance && newInstance.publicInstance.componentWillMount && newInstance.publicInstance.componentWillMount();
      parentDom.appendChild(newInstance.dom); // componentDidMount

      newInstance.publicInstance && newInstance.publicInstance.componentDidMount && newInstance.publicInstance.componentDidMount();
      return newInstance;
    } else if (element === null) {
      // componentWillUnmount
      instance.publicInstance && instance.publicInstance.componentWillUnmount && instance.publicInstance.componentWillUnmount();
      parentDom.removeChild(instance.dom);
      return null;
    } else if (instance.element.type !== element.type) {
      const newInstance = instantiate(element); // componentDidMount

      newInstance.publicInstance && newInstance.publicInstance.componentDidMount && newInstance.publicInstance.componentDidMount();
      parentDom.replaceChild(newInstance.dom, instance.dom);
      return newInstance;
    } else if (typeof element.type === "string") {
      updateDomProperties(instance.dom, instance.element.props, element.props);
      instance.childInstances = reconcileChildren(instance, element);
      instance.element = element;
      return instance;
    } else {
      if (instance.publicInstance && instance.publicInstance.shouldcomponentUpdate) {
        if (!instance.publicInstance.shouldcomponentUpdate()) {
          return;
        }
      } // componentWillUpdate


      instance.publicInstance && instance.publicInstance.componentWillUpdate && instance.publicInstance.componentWillUpdate();
      instance.publicInstance.props = element.props;
      const newChildElement = instance.publicInstance.render();
      const oldChildInstance = instance.childInstance;
      const newChildInstance = reconcile(parentDom, oldChildInstance, newChildElement); // componentDidUpdate

      instance.publicInstance && instance.publicInstance.componentDidUpdate && instance.publicInstance.componentDidUpdate();
      instance.dom = newChildInstance.dom;
      instance.childInstance = newChildInstance;
      instance.element = element;
      return instance;
    }
  }

  function reconcileChildren(instance, element) {
    const {
      dom,
      childInstances
    } = instance;
    const newChildElements = element.props.children || [];
    const count = Math.max(childInstances.length, newChildElements.length);
    const newChildInstances = [];

    for (let i = 0; i < count; i++) {
      newChildInstances[i] = reconcile(dom, childInstances[i], newChildElements[i]);
    }

    return newChildInstances.filter(instance => instance !== null);
  } //1.类组件的render方法以及函数式组件的返回值均为element
  //2.element是对组件实例或者dom节点的描述。如果type是string类型，则表示dom节点，如果type是function或者class类型，则表示组件实例。
  //3.dom类型的element.type为string类型，对应的instance结构为{element, dom, childInstances}。
  //4.Component类型的element.type为ReactClass类型，对应的instance结构为{dom, element, childInstance, publicInstance}，publicInstance就是组件实例。


  function instantiate(element) {
    const {
      type,
      props = {}
    } = element;
    const isDomElement = typeof type === "string";
    const isClassElement = !!(type.prototype && type.prototype.isReactComponent);

    if (isDomElement) {
      // 创建dom
      const isTextElement = type === TEXT_ELEMENT;
      const dom = isTextElement ? document.createTextNode("") : document.createElement(type); // 设置dom的事件、数据属性

      updateDomProperties(dom, [], element.props);
      const children = props.children || [];
      const childInstances = children.map(instantiate);
      const childDoms = childInstances.map(childInstance => childInstance.dom);
      childDoms.forEach(childDom => dom.appendChild(childDom));
      const instance = {
        element,
        dom,
        childInstances
      };
      return instance;
    } else if (isClassElement) {
      const instance = {};
      const publicInstance = createPublicInstance(element, instance);
      const childElement = publicInstance.render();
      const childInstance = instantiate(childElement);
      Object.assign(instance, {
        dom: childInstance.dom,
        element,
        childInstance,
        publicInstance
      });
      return instance;
    } else {
      const childElement = type(element.props);
      const childInstance = instantiate(childElement);
      const instance = {
        dom: childInstance.dom,
        element,
        childInstance
      };
      return instance;
    }
  }

  function createTextElement(value) {
    return createElement(TEXT_ELEMENT, {
      nodeValue: value
    });
  } //createElement函数的功能跟jsx是紧密相连 


  function createElement(type, props, ...children) {
    props = Object.assign({}, props);
    props.children = [].concat(...children).filter(child => child != null && child !== false).map(child => child instanceof Object ? child : createTextElement(child));
    return {
      type,
      props
    };
  }

  function createPublicInstance(element, instance) {
    const {
      type,
      props
    } = element;
    const publicInstance = new type(props);
    publicInstance.__internalInstance = instance;
    return publicInstance;
  }

  class Component {
    constructor(props) {
      this.props = props;
      this.state = this.state || {};
    }

    setState(partialState) {
      //合并state
      this.state = Object.assign({}, this.state, partialState); // update instance

      const parentDom = this.__internalInstance.dom.parentNode;
      const element = this.__internalInstance.element; //diff比较

      reconcile(parentDom, this.__internalInstance, element);
    }

  } //标记是否是React组件还是纯函数组件


  Component.prototype.isReactComponent = {};
  return {
    render,
    createElement,
    Component
  };
}
