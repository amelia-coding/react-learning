// 1.双向链表是指每个节点有previous和next两个属性来分别指向前后两个节点。
// 2.循环的意思是，最后一个节点的next指向第一个节点，
// 下面假设有一群人需要按照年龄进行排队，小孩站前边，大人站后边。
// 在一个过程内会不断有人过来，我们需要把他插到正确的位置。删除的话只考虑每次把排头的人给去掉。

//person的类型定义
interface Person {
  name: string; //姓名
  age: number; //年龄，依赖这个属性排序
  next: Person; //紧跟在后面的人,默认是null
  previous: Person; //前面相邻的那个人,默认是null
}
var firstNode = null; //一开始链表里没有节点

//插入的逻辑
function insertByAge(newPerson: Person) {
  if ((firstNode = null)) {
    //如果 firstNode为空，说明newPerson是第一个人，
    //把它赋值给firstNode，并把next和previous属性指向自身，自成一个环。
    firstNode = newPerson.next = newPerson.previous = newPerson;
  } else {
    //队伍里有人了，新来的人要找准自己的位置

    var next = null; //记录newPerson插入到哪个人前边
    var person = firstNode; // person 在下边的循环中会从第一个人开始往后找

    do {
      if (person.age > newPerson.age) {
        //如果person的年龄比新来的人大，说明新来的人找到位置了，他恰好要排在person的前边，结束
        next = person;
        break;
      }
      //继续找后面的人
      node = node.next;
    } while (node !== firstNode); //这里的while是为了防止无限循环，毕竟是环形的结构

    if (next === null) {
      //找了一圈发现 没有person的age比newPerson大，说明newPerson应该放到队伍的最后,也就是说newPerson的后面应该是firstNode。
      next = firstNode;
    } else if (next === firstNode) {
      //找第一个的时候就找到next了，说明newPerson要放到firstNode前面，这时候firstNode就要更新为newPerson
      firstNode = newPerson;
    }

    //下面是newPerson的插入操作，给next及previous两个人的前后链接都关联到newPerson
    var previous = next.previous;
    previous.next = next.previous = newPerson;
    newPerson.next = next;
    newPerson.previous = previous;
  }
  //插入成功
}

//删除第一个节点
function deleteFirstPerson() {
  if (firstNode === null) return; //队伍里没有人，返回

  var next = firstNode.next; //第二个人
  if (firstNode === next) {
    //这时候只有一个人
    firstNode = null;
    next = null;
  } else {
    var lastPerson = firstNode.previous; //找到最后一个人
    firstNode = lastPerson.next = next; //更新新的第一人
    next.previout = lastPerson; //并在新的第一人和最后一人之间建立连接
  }
}
