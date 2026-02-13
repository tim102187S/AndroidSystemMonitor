import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ScrollView, SafeAreaView, RefreshControl, useColorScheme, Linking, Platform, StatusBar as RNStatusBar } from 'react-native';
import { 
  Text, Card, Title, ProgressBar, MD3Colors, 
  Provider as PaperProvider, MD3DarkTheme, MD3LightTheme,
  IconButton, List, Modal, Portal, Button, Paragraph, TextInput, Dialog
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
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
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
  const [memory, setMemory] = useState({ total: 0, used: 0 });
  const [network, setNetwork] = useState({ type: '未知', ip: '...', isConnected: false, ssid: '未知' });
  const [weather, setWeather] = useState({ temp: '--', desc: '讀取中...', city: '偵測位置中' });
  const [device, setDevice] = useState({ model: '...', version: '...', brand: '...', uptime: '...', cpu: '...', api: 0 });
  
  const [currentStepCount, setCurrentStepCount] = useState(0);
  const [stepGoal, setStepGoal] = useState(6000);
  const [tempGoal, setTempGoal] = useState('6000');

  const theme = isDarkMode ? MD3DarkTheme : MD3LightTheme;

  // 載入儲存的目標步數
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
      await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      setWeather({ temp: '24°C', desc: '晴時多雲', city: '目前所在地' });
    } catch (e) {
      setWeather(prev => ({ ...prev, city: '讀取失敗', desc: '定位服務異常' }));
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const bLevel = await Battery.getBatteryLevelAsync();
      const bState = await Battery.getBatteryStateAsync();
      setBattery({ level: bLevel, state: bState });
    } catch (e) {}

    try {
      const isAvailable = await Pedometer.isAvailableAsync();
      if (isAvailable) {
        const { status } = await Pedometer.requestPermissionsAsync();
        if (status === 'granted') {
          const start = new Date(); start.setHours(0, 0, 0, 0);
          const stepResult = await Pedometer.getStepCountAsync(start, new Date());
          setCurrentStepCount(stepResult.steps);
        }
      }
    } catch (e) {}

    try {
      const free = await FileSystem.getFreeDiskStorageAsync();
      const total = await FileSystem.getTotalDiskCapacityAsync();
      setStorage({ total, free });
    } catch (e) {}

    try {
      const totalMem = await DeviceInfo.getTotalMemory();
      const usedMem = await DeviceInfo.getUsedMemory();
      setMemory({ total: totalMem, used: usedMem });

      const net = await NetInfo.fetch();
      const ip = await DeviceInfo.getIpAddress();
      let ssid = '隱藏或無權限';
      try {
        if (net.type === 'wifi') {
          const s = await DeviceInfo.getSsid();
          if (s) ssid = s;
        }
      } catch (e) {} 
      
      setNetwork({ type: net.type, ip, isConnected: net.isConnected ?? false, ssid });
    } catch (e) {}

    try {
      const uptimeMs = await DeviceInfo.getUptime();
      setDevice({
        model: Device.modelName || '未知',
        version: Device.osVersion || '未知',
        brand: Device.brand || '未知',
        uptime: `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m`,
        cpu: await DeviceInfo.getHardware(),
        api: await DeviceInfo.getApiLevel()
      });
    } catch (e) {}

    fetchWeather();
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <PaperProvider theme={theme}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <Portal>
        {/* 進階規格 Modal */}
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={[styles.modal, {backgroundColor: theme.colors.surface}]}>
          <Title style={{textAlign: 'center'}}>進階硬體規格</Title>
          <ScrollView>
            <List.Item title="製造商" description={device.brand} left={p => <List.Icon {...p} icon="factory" />} />
            <List.Item title="作業系統版本" description={device.version} left={p => <List.Icon {...p} icon="android" />} />
            <List.Item title="核心架構" description={device.cpu} left={p => <List.Icon {...p} icon="cpu-64-bit" />} />
            <List.Item title="Android API" description={device.api.toString()} left={p => <List.Icon {...p} icon="api" />} />
            <List.Item title="開機時長" description={device.uptime} left={p => <List.Icon {...p} icon="clock-outline" />} />
          </ScrollView>
          <Button mode="contained" onPress={() => setVisible(false)} style={{marginTop: 10}}>關閉視窗</Button>
        </Modal>

        {/* 修改目標步數 Dialog */}
        <Dialog visible={goalDialogVisible} onDismiss={() => setGoalDialogVisible(false)}>
          <Dialog.Title>設定每日步數目標</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="目標步數"
              value={tempGoal}
              onChangeText={setTempGoal}
              keyboardType="numeric"
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setGoalDialogVisible(false)}>取消</Button>
            <Button onPress={saveStepGoal}>儲存</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.header}>
          <Title style={{ color: theme.colors.primary, fontWeight: 'bold' }}>系統工具箱 v6.3</Title>
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
                  <IconButton icon="refresh" mode="outlined" size={28} onPress={() => { fetchData(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} />
                  <Text variant="labelSmall">重新整理</Text>
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
                <DonutChart label="儲存空間" percentage={storage.total > 0 ? ((storage.total - storage.free) / storage.total) * 100 : 0} color="#4CAF50" />
                <DonutChart label="記憶體" percentage={memory.total > 0 ? (memory.used / memory.total) * 100 : 0} color="#FF9800" />
              </View>
              <ProgressBar progress={battery.level} color={MD3Colors.primary50} style={{marginTop: 15, height: 10, borderRadius: 5}} />
              <Paragraph style={{textAlign: 'center', fontSize: 12, marginTop: 5}}>剩餘電力: {Math.round(battery.level * 100)}% ({battery.state === Battery.BatteryState.CHARGING ? '充電中' : '放電中'})</Paragraph>
            </Card.Content>
          </Card>

          <Text style={styles.footer}>* v6.3 修復 UI 重疊並增加目標自定義</Text>
        </ScrollView>
      </SafeAreaView>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    // 加入狀態欄高度補償，確保不會跟系統圖示重疊
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0 
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  scrollContent: { padding: 16 },
  card: { marginBottom: 16, borderRadius: 20, elevation: 4 },
  weatherRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  donutContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 10 },
  toolRow: { flexDirection: 'row', justifyContent: 'space-around' },
  toolItem: { alignItems: 'center' },
  modal: { margin: 20, padding: 25, borderRadius: 20 },
  footer: { textAlign: 'center', color: '#999', marginVertical: 20 },
});
