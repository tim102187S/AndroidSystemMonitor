import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, ScrollView, SafeAreaView, RefreshControl, useColorScheme, Linking, Platform, StatusBar as RNStatusBar } from 'react-native';
import { 
  Text, Card, Title, ProgressBar, MD3Colors, 
  Provider as PaperProvider, MD3DarkTheme, MD3LightTheme,
  IconButton, List, Modal, Portal, Button, Paragraph, TextInput, Dialog, Divider
} from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import * as Battery from 'expo-battery';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import DeviceInfo from 'react-native-device-info';
import NetInfo from '@react-native-community/netinfo';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const DonutChart = ({ percentage, color, label, size = 95, strokeWidth = 10 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle cx="50%" cy="50%" r={radius} stroke="#e0e0e0" strokeWidth={strokeWidth} fill="transparent" />
          <Circle cx="50%" cy="50%" r={radius} stroke={color} strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
        </G>
        <SvgText x="50%" y="50%" fill={color} fontSize="14" fontWeight="bold" textAnchor="middle" alignmentBaseline="central">{Math.round(percentage)}%</SvgText>
      </Svg>
      <Text style={{ marginTop: 8, fontWeight: 'bold', fontSize: 11 }}>{label}</Text>
    </View>
  );
};

export default function App() {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');
  const [refreshing, setRefreshing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [goalDialogVisible, setGoalDialogVisible] = useState(false);
  
  const [battery, setBattery] = useState({ level: 0, state: Battery.BatteryState.UNKNOWN });
  const [storage, setStorage] = useState({ total: 0, free: 0 });
  const [memory, setMemory] = useState({ total: Device.totalMemory || 0, used: 0 });
  const [network, setNetwork] = useState({ type: '未知', ip: '...', isConnected: false, ssid: '未知' });
  const [weather, setWeather] = useState({ temp: '--', desc: '讀取中...', city: '偵測位置中' });
  const [deviceInfo, setDeviceInfo] = useState({ 
    model: Device.modelName || '未知', 
    version: Device.osVersion || '未知', 
    brand: Device.brand || '未知', 
    uptime: '讀取中...', 
    cpu: '讀取中...', 
    api: Device.platformApiLevel || 0 
  });
  
  const [currentStepCount, setCurrentStepCount] = useState(0);
  const [stepGoal, setStepGoal] = useState(6000);
  const [tempGoal, setTempGoal] = useState('6000');

  // 用於防止重複發送通知的標記
  const lastNotified = useRef({ battery80: false, battery100: false, stepsDone: false });

  const theme = isDarkMode ? MD3DarkTheme : MD3LightTheme;

  // 初始化通知權限
  useEffect(() => {
    async function requestPermissions() {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('通知權限未獲得');
      }
      if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    }
    requestPermissions();
  }, []);

  const sendLocalNotification = async (title, body) => {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null, // 立即發送
    });
  };

  const getBatteryColor = (level) => {
    if (level < 0.2) return MD3Colors.error50;
    if (level < 0.8) return '#FFD700';
    return '#4CAF50';
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  useEffect(() => {
    const loadGoal = async () => {
      try {
        const savedGoal = await AsyncStorage.getItem('stepGoal');
        if (savedGoal !== null) {
          setStepGoal(parseInt(savedGoal));
          setTempGoal(savedGoal);
        }
      } catch (e) {}
    };
    loadGoal();
  }, []);

  const saveStepGoal = async () => {
    const newGoal = parseInt(tempGoal);
    if (!isNaN(newGoal) && newGoal > 0) {
      setStepGoal(newGoal);
      await AsyncStorage.setItem('stepGoal', newGoal.toString());
      setGoalDialogVisible(false);
      lastNotified.current.stepsDone = false; // 重設通知標記
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const fetchWeather = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setWeather(prev => ({ ...prev, city: '未獲取權限', desc: '請開啟定位' }));
        return;
      }
      setWeather({ temp: '24°C', desc: '晴時多雲', city: '目前所在地' });
    } catch (e) {
      setWeather(prev => ({ ...prev, city: '讀取失敗', desc: '服務異常' }));
    }
  };

  const fetchData = useCallback(async () => {
    // 1. 電池
    try {
      const l = await Battery.getBatteryLevelAsync();
      const s = await Battery.getBatteryStateAsync();
      setBattery({ level: l, state: s });

      // 電量通知邏輯
      const isCharging = s === Battery.BatteryState.CHARGING || s === Battery.BatteryState.FULL;
      if (isCharging) {
        if (l >= 1.0 && !lastNotified.current.battery100) {
          sendLocalNotification('🔋 電量已滿', '手機已完全充飽電！');
          lastNotified.current.battery100 = true;
        } else if (l >= 0.8 && l < 1.0 && !lastNotified.current.battery80) {
          sendLocalNotification('⚡ 充電提醒', '電量已達 80%，建議可停止充電以維護電池健康。');
          lastNotified.current.battery80 = true;
        }
      } else {
        // 拔掉插頭時重置通知標記
        if (l < 0.8) {
          lastNotified.current.battery80 = false;
          lastNotified.current.battery100 = false;
        }
      }
    } catch (e) {}

    // 2. 步數
    try {
      const isAvailable = await Pedometer.isAvailableAsync();
      if (isAvailable) {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const end = new Date();
        const stepResult = await Pedometer.getStepCountAsync(start, end);
        if (stepResult) {
          setCurrentStepCount(stepResult.steps);
          // 步數通知邏輯
          if (stepResult.steps >= stepGoal && !lastNotified.current.stepsDone) {
            sendLocalNotification('🏆 目標達成！', `恭喜！您今天已達成 ${stepGoal} 步的目標！`);
            lastNotified.current.stepsDone = true;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
      }
    } catch (e) {}

    // 3. 儲存空間
    try {
      const total = await FileSystem.getTotalDiskCapacityAsync();
      const free = await FileSystem.getFreeDiskStorageAsync();
      if (total > 0) setStorage({ total, free });
    } catch (e) {}

    // 4. 記憶體
    try {
      const used = await DeviceInfo.getUsedMemory();
      setMemory(prev => ({ ...prev, used: used }));
    } catch (e) {}

    // 5. 網路
    NetInfo.fetch().then(net => {
      setNetwork(prev => ({ ...prev, type: net.type, isConnected: net.isConnected ?? false }));
    }).catch(()=>{});
    DeviceInfo.getIpAddress().then(ip => setNetwork(prev => ({ ...prev, ip }))).catch(()=>{});

    // 6. 詳情
    try {
      const uptimeMs = await DeviceInfo.getUptime();
      const cpu = await DeviceInfo.getHardware();
      setDeviceInfo(prev => ({
        ...prev,
        uptime: uptimeMs ? `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m` : '未知',
        cpu: cpu || '未知'
      }));
    } catch (e) {}

    fetchWeather();
  }, [stepGoal]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <PaperProvider theme={theme}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={[styles.modal, {backgroundColor: theme.colors.surface}]}>
          <Title style={{textAlign: 'center'}}>進階硬體規格</Title>
          <ScrollView>
            <List.Item title="製造商" description={deviceInfo.brand} left={p => <List.Icon {...p} icon="factory" />} />
            <List.Item title="作業系統版本" description={deviceInfo.version} left={p => <List.Icon {...p} icon="android" />} />
            <List.Item title="核心架構" description={deviceInfo.cpu} left={p => <List.Icon {...p} icon="cpu-64-bit" />} />
            <List.Item title="Android API" description={deviceInfo.api.toString()} left={p => <List.Icon {...p} icon="api" />} />
            <List.Item title="開機時長" description={deviceInfo.uptime} left={p => <List.Icon {...p} icon="clock-outline" />} />
            <Divider />
            <List.Item title="總記憶體 (RAM)" description={formatBytes(Device.totalMemory)} left={p => <List.Icon {...p} icon="memory" />} />
          </ScrollView>
          <Button mode="contained" onPress={() => setVisible(false)} style={{marginTop: 10}}>關閉視窗</Button>
        </Modal>

        <Dialog visible={goalDialogVisible} onDismiss={() => setGoalDialogVisible(false)}>
          <Dialog.Title>設定每日步數目標</Dialog.Title>
          <Dialog.Content>
            <TextInput label="目標步數" value={tempGoal} onChangeText={setTempGoal} keyboardType="numeric" mode="outlined" />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setGoalDialogVisible(false)}>取消</Button>
            <Button onPress={saveStepGoal}>儲存</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.header}>
          <Title style={{ color: theme.colors.primary, fontWeight: 'bold' }}>Phone Tools v6.7</Title>
          <IconButton icon={isDarkMode ? "weather-sunny" : "weather-night"} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setIsDarkMode(!isDarkMode); }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setRefreshing(true); await fetchData(); setRefreshing(false); }} />}>
          
          <Card style={[styles.card, {backgroundColor: isDarkMode ? '#1e293b' : '#e0f2fe'}]}>
            <Card.Content style={styles.weatherRow}>
              <View>
                <Text variant="titleLarge" style={{fontWeight: 'bold'}}>{weather.city}</Text>
                <Text variant="bodyMedium">{weather.desc}</Text>
              </View>
              <View style={{alignItems: 'flex-end'}}>
                <Text variant="displaySmall" style={{fontWeight: 'bold', color: MD3Colors.primary40}}>{weather.temp}</Text>
                <Text variant="bodySmall">最後更新: 剛才</Text>
              </View>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.toolRow}>
                <View style={styles.toolItem}>
                  <IconButton icon="wifi-cog" mode="outlined" size={28} onPress={() => Linking.sendIntent('android.settings.WIFI_SETTINGS')} />
                  <Text variant="labelSmall">Wi-Fi</Text>
                </View>
                <View style={styles.toolItem}>
                  <IconButton icon="brightness-6" mode="outlined" size={28} onPress={() => Linking.sendIntent('android.settings.DISPLAY_SETTINGS')} />
                  <Text variant="labelSmall">亮度</Text>
                </View>
                <View style={styles.toolItem}>
                  <IconButton icon="information-outline" mode="outlined" size={28} onPress={() => setVisible(true)} />
                  <Text variant="labelSmall">詳情</Text>
                </View>
                <View style={styles.toolItem}>
                  <IconButton icon="bluetooth" mode="outlined" size={28} onPress={() => Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')} />
                  <Text variant="labelSmall">藍牙</Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          <Card style={styles.card} onPress={() => setGoalDialogVisible(true)}>
            <Card.Content>
              <View style={styles.donutContainer}>
                <DonutChart label="今日步數" percentage={stepGoal > 0 ? (currentStepCount / stepGoal) * 100 : 0} color="#2196F3" />
                <View style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
                  <Text variant="titleLarge" style={{fontWeight: 'bold'}}>{currentStepCount} 步</Text>
                  <Text variant="bodySmall">目標 {stepGoal} 步</Text>
                  <Button mode="text" compact onPress={() => setGoalDialogVisible(true)} labelStyle={{fontSize: 10}}>修改目標</Button>
                </View>
              </View>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.donutContainer}>
                <View style={{flex: 1, alignItems: 'center'}}>
                  <DonutChart label="儲存空間" percentage={storage.total > 0 ? ((storage.total - storage.free) / storage.total) * 100 : 0} color="#4CAF50" />
                  <View style={styles.usageInfo}>
                    <Text style={styles.usageText}>總共: {formatBytes(storage.total)}</Text>
                    <Text style={[styles.usageText, {color: '#4CAF50'}]}>已用: {formatBytes(storage.total - storage.free)}</Text>
                    <Text style={[styles.usageText, {color: '#999'}]}>剩餘: {formatBytes(storage.free)}</Text>
                  </View>
                </View>
                <View style={{flex: 1, alignItems: 'center'}}>
                  <DonutChart label="App 記憶體" percentage={memory.total > 0 ? (memory.used / memory.total) * 100 : 0} color="#FF9800" />
                  <View style={styles.usageInfo}>
                    <Text style={styles.usageText}>系統總量: {formatBytes(memory.total)}</Text>
                    <Text style={[styles.usageText, {color: '#FF9800'}]}>App 已用: {formatBytes(memory.used)}</Text>
                    <Text style={[styles.usageText, {color: '#999'}]}>系統可用: {formatBytes(memory.total - memory.used)}</Text>
                  </View>
                </View>
              </View>
              
              <Divider style={{marginVertical: 10}} />
              
              <ProgressBar 
                progress={battery.level} 
                color={getBatteryColor(battery.level)} 
                style={{height: 12, borderRadius: 6}} 
              />
              <Paragraph style={{textAlign: 'center', fontSize: 13, marginTop: 8, fontWeight: '600', color: getBatteryColor(battery.level)}}>
                剩餘電力: {Math.round(battery.level * 100)}% ({battery.state === Battery.BatteryState.CHARGING ? '充電中 ⚡' : '放電中'})
              </Paragraph>
            </Card.Content>
          </Card>

          <Text style={styles.footer}>* v6.7 支援電量與步數達成通知</Text>
        </ScrollView>
      </SafeAreaView>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  scrollContent: { padding: 16 },
  card: { marginBottom: 16, borderRadius: 20, elevation: 4 },
  weatherRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  donutContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 10 },
  usageInfo: { marginTop: 8, alignItems: 'center' },
  usageText: { fontSize: 9, fontWeight: '500', lineHeight: 14 },
  toolRow: { flexDirection: 'row', justifyContent: 'space-around' },
  toolItem: { alignItems: 'center' },
  modal: { margin: 20, padding: 25, borderRadius: 20 },
  footer: { textAlign: 'center', color: '#999', marginVertical: 20 },
});
