package com.rutafiltro.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface ProfileDao {
    @Query("SELECT * FROM profiles ORDER BY position, id") fun observeAll(): Flow<List<ProfileEntity>>
    @Query("SELECT * FROM profiles ORDER BY position, id") suspend fun all(): List<ProfileEntity>
    @Query("SELECT * FROM profiles WHERE id = :id") suspend fun byId(id: Long): ProfileEntity?
    @Query("SELECT COUNT(*) FROM profiles") suspend fun count(): Int
    @Insert suspend fun insert(p: ProfileEntity): Long
    @Update suspend fun update(p: ProfileEntity)
    @Query("DELETE FROM profiles WHERE id = :id") suspend fun delete(id: Long)
}

@Dao
interface ZoneDao {
    @Query("SELECT * FROM zones WHERE profileId = :profileId ORDER BY type, name") fun observe(profileId: Long): Flow<List<ZoneEntity>>
    @Query("SELECT * FROM zones WHERE profileId = :profileId") suspend fun forProfile(profileId: Long): List<ZoneEntity>
    @Upsert suspend fun upsert(z: ZoneEntity)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(z: List<ZoneEntity>)
    @Query("DELETE FROM zones WHERE id = :id") suspend fun delete(id: String)
    @Query("DELETE FROM zones WHERE profileId = :profileId") suspend fun deleteForProfile(profileId: Long)
}

@Dao
interface HistoryDao {
    @Insert suspend fun insert(h: HistoryEntity): Long
    @Query("SELECT * FROM history ORDER BY atMillis DESC, id DESC LIMIT :limit") fun observeRecent(limit: Int): Flow<List<HistoryEntity>>
    @Query("SELECT * FROM history WHERE pickupLat IS NOT NULL AND pickupLng IS NOT NULL AND (:includeSimulated OR simulated = 0) AND atMillis >= :since")
    fun observePickups(includeSimulated: Boolean, since: Long): Flow<List<HistoryEntity>>
    @Query("SELECT COUNT(*) FROM history") suspend fun count(): Int
    @Query("DELETE FROM history") suspend fun clear()
    @Query("DELETE FROM history WHERE atMillis < :before") suspend fun pruneBefore(before: Long): Int
    @Transaction
    suspend fun insertAndCap(h: HistoryEntity, cap: Int) {
        insert(h)
        trimTo(cap)
    }
    @Query("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY atMillis DESC, id DESC LIMIT :cap)")
    suspend fun trimTo(cap: Int)
}
