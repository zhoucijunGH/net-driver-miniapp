<template>
  <view v-if="privacyState.show" class="privacy-mask" @tap.stop>
    <view class="privacy-box">
      <view class="privacy-title">隐私授权提示</view>
      <view class="privacy-body">
        为向你提供拍照存凭证等功能，净司机需要申请<text class="hl">相册/摄像头</text>权限。
        请先阅读并同意{{ privacyState.contractName }}。
        <text class="privacy-link" @tap="openPolicy">查看隐私政策 ›</text>
      </view>
      <view class="privacy-actions">
        <button class="privacy-btn ghost" @tap="onDisagree">拒绝</button>
        <button class="privacy-btn primary" @tap="onAgree">同意并继续</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import Taro from '@tarojs/taro'
import { privacyState, agreePrivacy, disagreePrivacy } from '../utils/privacy'

function onAgree() {
  agreePrivacy()
}
function onDisagree() {
  disagreePrivacy()
  Taro.showToast({ title: '已取消，未获取相册/摄像头权限', icon: 'none' })
}
function openPolicy() {
  Taro.navigateTo({ url: '/pages/privacy/index' }).catch(() => {})
}
</script>

<style>
.privacy-mask {
  position: fixed; left: 0; top: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center;
  z-index: 999;
}
.privacy-box {
  width: 600rpx; background: #fff; border-radius: 24rpx; padding: 40rpx 36rpx 32rpx;
  box-sizing: border-box;
}
.privacy-title { font-size: 34rpx; font-weight: 700; color: #1D2129; text-align: center; margin-bottom: 24rpx; }
.privacy-body { font-size: 27rpx; line-height: 1.7; color: #4E5969; }
.privacy-body .hl { color: #FF7E33; }
.privacy-link { color: #FF7E33; margin-left: 4rpx; }
.privacy-actions { display: flex; gap: 20rpx; margin-top: 36rpx; }
.privacy-btn { flex: 1; font-size: 28rpx; border-radius: 40rpx; padding: 18rpx 0; line-height: 1.4; margin: 0; }
.privacy-btn.ghost { background: #F2F3F5; color: #4E5969; }
.privacy-btn.primary { background: #FF7E33; color: #fff; }
</style>
