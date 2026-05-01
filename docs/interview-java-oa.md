# 泛微OA方向 - Java面试题库

> 适用对象：4年工作经验，主攻泛微OA开发
> 更新日期：2026-05-01

---

## 目录

1. [Java基础核心](#一java基础核心)
2. [Spring框架基础](#二spring框架基础)
3. [Spring MVC与Spring Boot](#三spring-mvc与spring-boot)
4. [数据库与MyBatis](#四数据库与mybatis)
5. [泛微OA专项](#五泛微oa专项)
6. [并发编程与JVM](#六并发编程与jvm)

---

## 一、Java基础核心

### 1.1 面向对象三大特性

**Q：请解释面向对象的三大特性？**

**A：**

| 特性 | 说明 | 示例 |
|------|------|------|
| 封装 | 将数据和操作数据的方法绑定在一起，隐藏内部实现细节 | 类的private字段 + getter/setter |
| 继承 | 子类继承父类的属性和方法，实现代码复用 | `class Manager extends Employee` |
| 多态 | 同一操作作用于不同对象，可以有不同的解释 | 方法重写 + 父类引用指向子类对象 |

```java
// 多态示例
class Animal {
    void speak() { System.out.println("动物叫"); }
}
class Dog extends Animal {
    @Override
    void speak() { System.out.println("汪汪"); }
}
Animal a = new Dog();  // 父类引用指向子类对象
a.speak();  // 输出：汪汪 (运行时多态)
```

---

### 1.2 String、StringBuilder、StringBuffer区别

**Q：三者的区别是什么？什么场景使用哪个？**

**A：**

| 类 | 可变性 | 线程安全 | 性能 | 使用场景 |
|----|--------|----------|------|----------|
| String | 不可变 | 是 | 低 | 字符串常量、少量拼接 |
| StringBuilder | 可变 | 否 | 高 | 单线程大量拼接 |
| StringBuffer | 可变 | 是 | 中 | 多线程大量拼接 |

```java
// String不可变，每次拼接都创建新对象
String s = "a";
s = s + "b";  // 创建了3个对象: "a", "b", "ab"

// StringBuilder高效拼接
StringBuilder sb = new StringBuilder();
sb.append("a").append("b").append("c");
String result = sb.toString();
```

---

### 1.3 equals()与==的区别

**Q：equals()和==有什么区别？重写equals为什么必须重写hashCode？**

**A：**

- `==`：比较引用地址（对象）或值（基本类型）
- `equals()`：默认比较引用地址，可重写为比较内容

**为什么必须一起重写：**

```java
// HashMap使用hashCode定位桶，再用equals比较key
Map<User, String> map = new HashMap<>();
User u1 = new User("张三");
User u2 = new User("张三");

// 如果只重写equals不重写hashCode：
map.put(u1, "value1");
map.get(u2);  // 可能返回null，因为hashCode不同，找不到桶

// 正确做法：
@Override
public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof User)) return false;
    User user = (User) o;
    return Objects.equals(name, user.name);
}

@Override
public int hashCode() {
    return Objects.hash(name);  // equals相等 => hashCode必须相等
}
```

---

### 1.4 集合框架

**Q：ArrayList和LinkedList的区别？HashMap底层原理？**

**A：**

| 集合 | 底层结构 | 随机访问 | 插入/删除 | 适用场景 |
|------|----------|----------|-----------|----------|
| ArrayList | 动态数组 | O(1) | O(n) | 频繁查询 |
| LinkedList | 双向链表 | O(n) | O(1) | 频繁增删 |

**HashMap底层原理（JDK 1.8+）：**

```
HashMap结构：
数组 + 链表 + 红黑树

1. 默认初始容量16，负载因子0.75
2. 当链表长度 > 8 且 数组长度 >= 64 时，链表转红黑树
3. 当链表长度 < 6 时，红黑树转链表
4. 扩容机制：容量翻倍，重新hash分布
```

---

### 1.5 异常体系

**Q：Error和Exception的区别？Checked和Unchecked异常？**

**A：**

```
Throwable
├── Error（不可恢复的严重错误）
│   ├── OutOfMemoryError
│   ├── StackOverflowError
│   └── NoClassDefFoundError
│
└── Exception（可处理的异常）
    ├── Checked Exception（编译时检查）
    │   ├── IOException
    │   ├── SQLException
    │   └── ClassNotFoundException
    │
    └── RuntimeException（运行时异常）
        ├── NullPointerException
        ├── IndexOutOfBoundsException
        ├── IllegalArgumentException
        └── NumberFormatException
```

**泛微OA场景举例：**
```java
try {
    workflowService.submitFlow(flowId);
} catch (WorkflowException e) {
    logger.error("流程提交失败: {}", e.getMessage());
    throw new BusinessException("流程提交失败，请联系管理员");
} catch (SQLException e) {
    throw new SystemException("数据库异常");
}
```

---

### 1.6 泛型与反射

**Q：什么是泛型？反射的作用是什么？**

**A：**

**泛型：** 参数化类型，编译时类型检查，运行擦除

```java
public <T> List<T> parseList(String json, Class<T> clazz) {
    return JSON.parseArray(json, clazz);
}
```

**反射：** 运行时获取类信息并操作

```java
// 泛微OA中反射应用场景：动态加载插件类
String className = "com.weaver.plugin.CustomAction";
Class<?> clazz = Class.forName(className);
Object instance = clazz.getDeclaredConstructor().newInstance();
Method method = clazz.getMethod("execute", RequestInfo.class);
method.invoke(instance, requestInfo);
```

---

## 二、Spring框架基础

### 2.1 IoC容器

**Q：什么是IoC？Spring IoC容器的工作原理？**

**A：**

**IoC（控制反转）：** 将对象创建和依赖关系的维护交给Spring容器

```java
// 传统方式：手动创建依赖
UserService userService = new UserService();
UserDao userDao = new UserDao();
userService.setUserDao(userDao);

// IoC方式：Spring自动注入
@Service
public class UserService {
    @Autowired
    private UserDao userDao;
}
```

**工作原理：**

```
1. 读取配置（XML/注解）
2. 解析BeanDefinition
3. 实例化Bean（构造方法）
4. 属性注入（@Autowired）
5. 初始化（@PostConstruct、BeanPostProcessor）
6. 放入单例池缓存
```

---

### 2.2 Bean生命周期

**Q：Spring Bean的生命周期？**

**A：**

```
实例化 → 属性注入 → 初始化 → 使用 → 销毁

关键扩展点：
1. InstantiationAwareBeanPostProcessor（实例化前）
2. 构造方法实例化
3. @Autowired属性注入
4. BeanNameAware.setBeanName()
5. BeanFactoryAware.setBeanFactory()
6. BeanPostProcessor.postProcessBefore()（初始化前）
7. @PostConstruct方法
8. InitializingBean.afterPropertiesSet()
9. init-method
10. BeanPostProcessor.postProcessAfter()（初始化后）
11. 放入单例池，提供使用
12. @PreDestroy / DisposableBean.destroy()（销毁）
```

---

### 2.3 依赖注入方式

**Q：Spring依赖注入有哪几种方式？推荐哪种？**

**A：**

```java
// 1. 字段注入（不推荐，难以测试）
@Service
public class OrderService {
    @Autowired
    private OrderDao orderDao;
}

// 2. Setter注入（可选依赖）
@Service
public class OrderService {
    @Autowired(required = false)
    public void setOrderDao(OrderDao orderDao) {
        this.orderDao = orderDao;
    }
}

// 3. 构造器注入（推荐）
@Service
public class OrderService {
    private final OrderDao orderDao;
    
    public OrderService(OrderDao orderDao) {
        this.orderDao = orderDao;
    }
}
```

**推荐构造器注入的原因：** 依赖不可变、保证不为null、便于单元测试、避免循环依赖

---

### 2.4 Bean作用域

**Q：Spring Bean有哪几种作用域？**

**A：**

| 作用域 | 说明 | 使用场景 |
|--------|------|----------|
| singleton | 单例（默认） | Service、Dao |
| prototype | 原型 | 有状态对象 |
| request | 请求级 | Web环境 |
| session | 会话级 | 用户会话数据 |

```java
// 泛微OA场景：流程实例使用prototype
@Component
@Scope("prototype")
public class FlowInstance {
    private String flowId;
    private List<FlowNode> nodes;
}
```

---

### 2.5 Spring事务传播行为

**Q：Spring事务的传播行为有哪些？**

**A：**

| 传播行为 | 说明 | 场景 |
|----------|------|------|
| REQUIRED | 默认，加入现有事务或新建 | 常规业务方法 |
| REQUIRES_NEW | 挂起当前事务，新建独立事务 | 日志记录 |
| NESTED | 嵌套事务 | 子流程独立控制 |
| SUPPORTS | 支持当前事务，没有就以非事务执行 | 查询方法 |
| NOT_SUPPORTED | 以非事务方式执行 | 批量操作优化 |
| MANDATORY | 必须在事务中 | 强制事务场景 |
| NEVER | 必须不在事务中 | 特殊场景 |

```java
@Service
public class WorkflowService {

    @Transactional(propagation = Propagation.REQUIRED)
    public void submitWorkflow(Workflow workflow) {
        workflowDao.insert(workflow);
        // 日志独立事务，不受主事务回滚影响
        logService.saveLog(workflow.getId(), "提交流程");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveLog(String workflowId, String action) {
        logDao.insert(workflowId, action);
    }
}
```

---

### 2.6 @Transactional失效场景

**Q：哪些情况会导致@Transactional失效？**

**A：**

```java
// 失效场景1：同类内部方法调用（自调用）
@Service
public class UserService {
    public void createUser(User user) {
        saveUser(user);  // 直接调用不经过代理，事务失效
    }

    @Transactional
    public void saveUser(User user) {
        userDao.insert(user);
    }
}

// 解决：注入自身或使用AopContext.currentProxy()

// 失效场景2：方法不是public
@Transactional
private void saveUser(User user) {}  // 失效

// 失效场景3：异常被catch吞掉
@Transactional
public void saveUser(User user) {
    try {
        userDao.insert(user);
    } catch (Exception e) {
        // 异常被吞，事务不会回滚
    }
}

// 失效场景4：rollbackFor配置错误
@Transactional(rollbackFor = IOException.class)
public void saveUser(User user) {
    throw new RuntimeException("错误");  // 不会回滚
}
```

---

## 三、Spring MVC与Spring Boot

### 3.1 Spring MVC请求流程

**Q：一个HTTP请求在Spring MVC中是如何处理的？**

**A：**

```
HTTP请求 → DispatcherServlet → HandlerMapping → HandlerAdapter → Controller → 返回结果
```

```java
@RestController
@RequestMapping("/api/workflow")
public class WorkflowController {

    @GetMapping("/list")
    public Result<List<Workflow>> list(@RequestParam String userId) {
        return Result.success(workflowService.getByUserId(userId));
    }

    @PostMapping("/submit")
    public Result<Void> submit(@RequestBody WorkflowSubmitDTO dto) {
        workflowService.submit(dto);
        return Result.success();
    }
}
```

---

### 3.2 @RestController与@Controller区别

**Q：@RestController和@Controller的区别？**

**A：**

- `@Controller`：返回视图名称（如JSP、Thymeleaf）
- `@RestController`：返回JSON数据（等于 @Controller + @ResponseBody）

---

### 3.3 Spring Boot自动配置

**Q：Spring Boot自动配置原理？**

**A：**

```
@SpringBootApplication
→ @EnableAutoConfiguration
→ 读取 META-INF/spring.factories
→ 加载所有AutoConfiguration类
→ 根据@Conditional条件判断是否生效
```

---

## 四、数据库与MyBatis

### 4.1 MyBatis基础

**Q：MyBatis中#{}和${}的区别？**

**A：**

- `#{}`：预编译，防止SQL注入（推荐）
- `${}`：字符串拼接，有注入风险（仅用于动态表名、列名）

```xml
<!-- 预编译 -->
<select id="getWorkflow" resultType="Workflow">
    SELECT * FROM workflow WHERE id = #{id}
</select>

<!-- 字符串拼接 -->
<select id="getWorkflow" resultType="Workflow">
    SELECT * FROM workflow ORDER BY ${columnName}
</select>
```

---

### 4.2 动态SQL

**Q：MyBatis常用的动态SQL标签有哪些？**

**A：**

```xml
<select id="queryWorkflows" resultType="Workflow">
    SELECT * FROM workflow
    <where>
        <if test="status != null">
            AND status = #{status}
        </if>
        <if test="keyword != null">
            AND workflow_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
    </where>
    <choose>
        <when test="orderBy == 'time'">ORDER BY create_time DESC</when>
        <otherwise>ORDER BY id DESC</otherwise>
    </choose>
</select>
```

---

### 4.3 批量操作

**Q：MyBatis如何批量插入/更新？**

**A：**

```xml
<!-- 批量插入 -->
<insert id="batchInsert" parameterType="list">
    INSERT INTO workflow_node (flow_id, node_name, approver)
    VALUES
    <foreach collection="list" item="node" separator=",">
        (#{node.flowId}, #{node.nodeName}, #{node.approver})
    </foreach>
</insert>
```

```java
// Java代码：使用ExecutorType.BATCH
try (SqlSession session = sqlSessionFactory.openSession(ExecutorType.BATCH)) {
    WorkflowNodeMapper mapper = session.getMapper(WorkflowNodeMapper.class);
    for (int i = 0; i < nodes.size(); i++) {
        mapper.insert(nodes.get(i));
        if (i % 500 == 0) {
            session.flushStatements();
        }
    }
    session.flushStatements();
}
```

---

### 4.4 SQL优化

**Q：泛微OA常见SQL优化手段？**

**A：**

```sql
-- 1. 合理使用索引
CREATE INDEX idx_workflow_status ON workflow(status, create_time);

-- 2. 避免SELECT *
SELECT id, workflow_name, status, create_time FROM workflow WHERE status = 'running';

-- 3. 深分页优化（使用主键游标）
SELECT * FROM workflow WHERE id > #{lastId} ORDER BY id LIMIT 10;

-- 4. 使用EXPLAIN分析执行计划
EXPLAIN SELECT * FROM workflow WHERE status = 'running';
```

---

## 五、泛微OA专项

### 5.1 系统架构

**Q：请描述泛微OA的系统架构？**

**A：**

```
表现层：Web端 / 移动端 / 企业微信 / 钉钉
应用层：工作流程 | 知识文档 | 人力资源 | 财务管理
平台层：流程引擎 | 表单引擎 | 权限引擎 | 消息引擎
数据层：MySQL/Oracle/SQL Server | Redis | 文件存储
```

---

### 5.2 流程引擎设计

**Q：如何设计一个工作流引擎？**

**A：**

**核心数据模型：**

```sql
-- 流程定义表
CREATE TABLE workflow_definition (
    id VARCHAR(32) PRIMARY KEY,
    workflow_name VARCHAR(100),
    version INT,
    status TINYINT
);

-- 流程节点表
CREATE TABLE workflow_node (
    id VARCHAR(32) PRIMARY KEY,
    workflow_id VARCHAR(32),
    node_name VARCHAR(50),
    node_type TINYINT,  -- 1开始 2审批 3条件 4结束
    approver_type TINYINT,  -- 1指定人 2角色 3部门 4发起人上级
    approver_value VARCHAR(200)
);

-- 流程实例表
CREATE TABLE workflow_instance (
    id VARCHAR(32) PRIMARY KEY,
    workflow_id VARCHAR(32),
    initiator VARCHAR(32),
    current_node VARCHAR(32),
    status TINYINT  -- 0草稿 1审批中 2通过 3驳回
);

-- 流程任务表
CREATE TABLE workflow_task (
    id VARCHAR(32) PRIMARY KEY,
    instance_id VARCHAR(32),
    node_id VARCHAR(32),
    assignee VARCHAR(32),
    status TINYINT,  -- 0待处理 1已同意 2已驳回
    opinion VARCHAR(500)
);
```

**流程执行核心逻辑：**

```java
@Service
@Transactional
public class WorkflowEngineService {

    public String submitWorkflow(String workflowId, String initiator) {
        // 1. 创建流程实例
        WorkflowInstance instance = new WorkflowInstance();
        instance.setId(UUID.randomUUID().toString().replace("-", ""));
        instance.setWorkflowId(workflowId);
        instance.setInitiator(initiator);
        instance.setStatus(1);
        instanceMapper.insert(instance);

        // 2. 获取第一个节点并创建任务
        WorkflowNode firstNode = nodeMapper.getFirstNode(workflowId);
        instance.setCurrentNode(firstNode.getId());
        instanceMapper.updateById(instance);
        createTask(instance.getId(), firstNode, initiator);

        return instance.getId();
    }

    public void approveTask(String taskId, String userId, String opinion, boolean approved) {
        WorkflowTask task = taskMapper.selectById(taskId);
        task.setStatus(approved ? 1 : 2);
        task.setOpinion(opinion);
        taskMapper.updateById(task);

        WorkflowInstance instance = instanceMapper.selectById(task.getInstanceId());

        if (approved) {
            WorkflowNode nextNode = findNextNode(instance.getWorkflowId(), task.getNodeId());
            if (nextNode == null || nextNode.getNodeType() == 4) {
                instance.setStatus(2);  // 流程通过
            } else {
                instance.setCurrentNode(nextNode.getId());
                createTask(instance.getId(), nextNode, instance.getInitiator());
            }
        } else {
            instance.setStatus(3);  // 驳回
        }
        instanceMapper.updateById(instance);
    }

    private String resolveApprover(WorkflowNode node, String initiator) {
        switch (node.getApproverType()) {
            case 1: return node.getApproverValue();
            case 2: return roleService.getUserByRole(node.getApproverValue());
            case 3: return deptService.getManager(node.getApproverValue());
            case 4: return userService.getManager(initiator);
            default: throw new RuntimeException("未知的审批人类型");
        }
    }
}
```

---

### 5.3 权限设计

**Q：泛微OA中如何设计权限体系？**

**A：**

**RBAC模型（基于角色的访问控制）：**

```sql
-- 用户表、角色表、权限表
-- 用户角色关联表 sys_user_role(user_id, role_id)
-- 角色权限关联表 sys_role_permission(role_id, permission_id)
```

```java
// Spring Security配置
@Configuration
@EnableWebSecurity
public class SecurityConfig extends WebSecurityConfigurerAdapter {
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http.authorizeRequests()
            .antMatchers("/api/workflow/view").hasAuthority("workflow:view")
            .antMatchers("/api/workflow/submit").hasAuthority("workflow:submit")
            .anyRequest().authenticated();
    }
}

// 自定义权限注解
@Target({ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequirePermission {
    String value();
}

// 使用
@RequirePermission("workflow:approve")
@PostMapping("/workflow/approve")
public Result<Void> approve(@RequestBody ApproveDTO dto) {
    workflowService.approve(dto);
    return Result.success();
}
```

---

### 5.4 消息通知机制

**Q：泛微OA中如何实现待办通知？**

**A：**

```java
@Service
public class NotifyService {

    @Async  // 异步发送，不阻塞主流程
    public void sendTodo(String instanceId, WorkflowNode node) {
        String assignee = resolveApprover(node);

        // 1. 站内消息
        messageMapper.insert(new Message(instanceId, assignee, "TODO", "您有新的待办任务"));

        // 2. WebSocket实时推送
        webSocketServer.sendToUser(assignee, MessageVO.builder()
            .type("TODO")
            .title("新待办")
            .content("您有一个流程需要审批")
            .build());

        // 3. 企业微信/钉钉推送
        wechatClient.sendTodoMessage(assignee, "您有一个流程待审批");
    }
}
```

---

### 5.5 接口集成

**Q：泛微OA如何与第三方系统集成？**

**A：**

```java
@RestController
@RequestMapping("/api/integration")
public class IntegrationController {

    @PostMapping("/hr/syncOrg")
    public Result<Void> syncOrg(@RequestBody OrgSyncRequest request) {
        syncService.syncOrganization(request.getData());
        return Result.success();
    }

    @PostMapping("/callback")
    public Result<Void> handleCallback(@RequestBody CallbackRequest request) {
        callbackService.handle(request);
        return Result.success();
    }
}

// 带重试的推送服务
@Service
public class IntegrationService {
    @Retryable(value = RestClientException.class, maxAttempts = 3, backoff = @Backoff(delay = 2000))
    public void pushToExternal(String url, Object data) {
        restTemplate.postForEntity(url, data, String.class);
    }

    @Recover
    public void recover(RestClientException e, String url, Object data) {
        // 重试失败后记录到失败队列，后续定时补偿
        failedQueueMapper.insert(url, JSON.toJSONString(data));
    }
}
```

---

## 六、并发编程与JVM

### 6.1 线程池

**Q：如何正确创建和使用线程池？**

**A：**

```java
// 错误：使用Executors（可能OOM）
ExecutorService executor = Executors.newFixedThreadPool(100);  // 无界队列

// 正确：使用ThreadPoolExecutor
ThreadPoolExecutor executor = new ThreadPoolExecutor(
    10,                      // 核心线程数
    20,                      // 最大线程数
    60,                      // 空闲线程存活时间
    TimeUnit.SECONDS,
    new LinkedBlockingQueue<>(1000),  // 有界队列
    new ThreadFactoryBuilder().setNameFormat("workflow-pool-%d").build(),
    new ThreadPoolExecutor.CallerRunsPolicy()  // 拒绝策略
);
```

**泛微OA线程池配置：**

```java
@Configuration
public class ThreadPoolConfig {
    @Bean("workflowExecutor")
    public ThreadPoolExecutor workflowExecutor() {
        return new ThreadPoolExecutor(
            5, 10, 60, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(500),
            r -> new Thread(r, "workflow-" + Thread.currentThread().getId()),
            new ThreadPoolExecutor.CallerRunsPolicy()
        );
    }
}
```

---

### 6.2 并发工具类

**Q：常用的并发工具类有哪些？**

**A：**

| 工具类 | 用途 | 场景 |
|--------|------|------|
| CountDownLatch | 等待多个线程完成 | 批量数据加载 |
| CompletableFuture | 异步编程 | 并行调用多个接口 |
| Semaphore | 控制并发数 | 限流 |

```java
// CompletableFuture示例：并行查询
public WorkflowDetailVO getWorkflowDetail(String id) {
    CompletableFuture<Workflow> wfFuture = CompletableFuture.supplyAsync(
        () -> workflowMapper.selectById(id), executor);
    CompletableFuture<List<Task>> taskFuture = CompletableFuture.supplyAsync(
        () -> taskMapper.selectByInstanceId(id), executor);
    
    return CompletableFuture.allOf(wfFuture, taskFuture)
        .thenApply(v -> {
            WorkflowDetailVO vo = new WorkflowDetailVO();
            vo.setWorkflow(wfFuture.join());
            vo.setTasks(taskFuture.join());
            return vo;
        }).join();
}
```

---

### 6.3 锁机制

**Q：synchronized和ReentrantLock的区别？分布式锁如何实现？**

**A：**

| 特性 | synchronized | ReentrantLock |
|------|--------------|---------------|
| 实现 | JVM内置 | API层面 |
| 可中断 | 否 | 是 |
| 公平锁 | 否 | 可配置 |
| 条件变量 | 一个 | 多个 |

**分布式锁（Redis实现）：**

```java
@Component
public class RedisDistributedLock {
    public boolean tryLock(String key, String value, long expireSeconds) {
        return Boolean.TRUE.equals(
            redisTemplate.opsForValue().setIfAbsent(key, value, expireSeconds, TimeUnit.SECONDS));
    }

    public void unlock(String key, String value) {
        String script = "if redis.call('get', KEYS[1]) == ARGV[1] then " +
                       "return redis.call('del', KEYS[1]) else return 0 end";
        redisTemplate.execute(new DefaultRedisScript<>(script, Long.class),
            Collections.singletonList(key), value);
    }
}

// 使用：防止重复提交
@PostMapping("/workflow/submit")
public Result<Void> submitWorkflow(@RequestBody WorkflowDTO dto) {
    String lockKey = "workflow:submit:" + dto.getUserId();
    String lockValue = UUID.randomUUID().toString();

    if (!distributedLock.tryLock(lockKey, lockValue, 10)) {
        return Result.error("请勿重复提交");
    }
    try {
        workflowService.submit(dto);
        return Result.success();
    } finally {
        distributedLock.unlock(lockKey, lockValue);
    }
}
```

---

### 6.4 JVM内存模型

**Q：JVM内存区域划分？常见OOM问题？**

**A：**

```
JVM内存结构：
├── 方法区（Metaspace）：类信息、常量、静态变量
├── 堆内存
│   ├── 新生代（Eden + Survivor0 + Survivor1）
│   └── 老年代（长期存活的对象）
└── 栈内存：局部变量表、操作数栈
```

**泛微OA常见OOM场景：**

```java
// 场景1：大Excel导出导致堆OOM
// 错误：一次性查询所有数据
List<Workflow> all = workflowMapper.selectAll();  // 可能几十万条

// 正确：分批查询+流式写入
int pageSize = 1000;
int offset = 0;
while (true) {
    List<Workflow> batch = workflowMapper.selectByPage(offset, pageSize);
    if (batch.isEmpty()) break;
    writer.write(batch);
    offset += pageSize;
}

// 场景2：缓存无限增长
// 正确：使用有界缓存
Cache<String, Object> cache = Caffeine.newBuilder()
    .maximumSize(10000)
    .expireAfterWrite(1, TimeUnit.HOURS)
    .build();
```

**JVM常用参数：**

```bash
-Xms2g -Xmx2g                    # 堆内存
-XX:MetaspaceSize=256m            # Metaspace
-XX:+UseG1GC                      # G1垃圾回收器
-XX:+HeapDumpOnOutOfMemoryError   # OOM时生成Dump
```

---

### 6.5 GC垃圾回收与内存泄漏排查

**Q：如何排查内存泄漏？**

**A：**

```bash
# 1. 获取堆Dump
jmap -dump:format=b,file=heap.hprof <pid>

# 2. 使用MAT分析堆Dump
# 查看Dominator Tree，找大对象
# 查看GC Roots引用链

# 3. 常用排查命令
jstat -gcutil <pid> 1000    # 查看GC情况
jmap -histo <pid> | head -20  # 查看对象分布
jstack <pid>                 # 查看线程堆栈
```

**内存泄漏常见原因：**

```java
// 原因1：ThreadLocal未清理
public class UserContext {
    private static ThreadLocal<User> currentUser = new ThreadLocal<>();
    // 必须在Filter中清理
}

// 正确清理方式
public class UserContextFilter implements Filter {
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) {
        try {
            UserContext.setUser(user);
            chain.doFilter(req, res);
        } finally {
            UserContext.clear();  // 必须清理
        }
    }
}

// 原因2：集合只增不减
// 正确：使用有界队列
BlockingQueue<String> logQueue = new ArrayBlockingQueue<>(10000);
```

---

## 附录：面试常考快速问答

### A. Java基础速查

| 问题 | 答案 |
|------|------|
| String是基本类型吗？ | 不是，是引用类型，final类不可变 |
| int和Integer区别？ | int是基本类型，Integer是包装类，有缓存(-128~127) |
| ArrayList扩容机制？ | 默认容量10，扩容为原容量的1.5倍 |
| HashMap线程安全吗？ | 不安全，并发用ConcurrentHashMap |
| final关键字作用？ | 修饰类不可继承、方法不可重写、变量不可变 |

### B. Spring速查

| 问题 | 答案 |
|------|------|
| Spring核心是什么？ | IoC控制反转 + AOP面向切面 |
| @Autowired注入方式？ | 按类型注入，同类型多个用@Qualifier |
| Spring事务失效原因？ | 非public、自调用、异常被吞、rollbackFor配置错误 |
| Bean默认作用域？ | singleton单例 |
| 循环依赖怎么解决？ | 三级缓存，构造器注入无法解决 |

### C. MyBatis速查

| 问题 | 答案 |
|------|------|
| #{}和${}区别？ | #{}预编译防注入，${}字符串拼接 |
| 一级缓存范围？ | SqlSession级别，默认开启 |
| 二级缓存范围？ | Mapper级别，需手动开启 |
| 批量操作优化？ | ExecutorType.BATCH + 分批flush |

### D. 泛微OA速查

| 问题 | 答案 |
|------|------|
| 流程引擎核心表？ | workflow_definition, workflow_node, workflow_instance, workflow_task |
| 权限模型？ | RBAC（用户-角色-权限） |
| 待办通知方式？ | 站内消息 + WebSocket + 企业微信/钉钉 + 邮件 |
| 表单存储方式？ | JSON字段 或 动态表 |
| 接口集成方式？ | REST API + 消息队列 + 定时同步 |

---

## 面试技巧

### 1. 回答问题结构

```
STAR法则：
S - Situation（背景）：在泛微OA项目中...
T - Task（任务）：需要解决审批流性能问题...
A - Action（行动）：我采用了线程池+分批处理...
R - Result（结果）：响应时间从5s降到200ms...
```

### 2. 泛微OA项目经验包装

```
推荐项目描述模板：

"我负责泛微OA系统的流程引擎开发，主要包括：
1. 审批流引擎设计与实现，支持动态节点配置和条件分支
2. 权限体系搭建，基于RBAC模型实现细粒度权限控制
3. 消息通知中心，集成WebSocket实时推送和企业微信/钉钉
4. 性能优化，通过线程池和分批处理，支撑日均10000+流程审批
5. 第三方系统集成，与HR/ERP系统对接，实现组织架构同步"
```

### 3. 遇到不会的问题

- 坦诚回答："这个知识点我了解不深，但我的理解是..."
- 关联经验："在实际项目中，我遇到过类似场景，当时我是这样解决的..."
- 学习态度："这个问题我会下去深入研究，感谢提醒"

---

> 祝面试顺利！这份文档覆盖了泛微OA方向的核心考点，建议重点复习：
> 1. Spring事务管理
> 2. MyBatis动态SQL与批量操作
> 3. 流程引擎设计
> 4. RBAC权限模型
> 5. 线程池与并发编程
